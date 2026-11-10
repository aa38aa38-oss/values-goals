# -*- coding: utf-8 -*-
"""
Telegram 研究報告下載器（唯讀）

只會「讀取訊息」與「下載附件」，程式中沒有任何發送訊息、按已讀、
加入/退出群組的動作。

指令：
    python tg_reports.py list     列出你所在的群組與論壇主題（含 ID）
    python tg_reports.py fetch    下載歷史訊息中的報告後結束
    python tg_reports.py watch    先補抓歷史，然後持續監聽新報告（Ctrl+C 結束）
"""

import asyncio
import configparser
import csv
import json
import os
import re
import sys
from datetime import timezone, timedelta

from telethon import TelegramClient, events, utils
from telethon.tl import functions, types

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.ini")
SESSION_PATH = os.path.join(BASE_DIR, "reader")  # 登入資訊 reader.session（勿外流）
STATE_PATH = os.path.join(BASE_DIR, "downloaded.json")
TW = timezone(timedelta(hours=8))

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


# ---------------------------------------------------------------- 設定
def load_config():
    if not os.path.exists(CONFIG_PATH):
        sys.exit("找不到 config.ini：請先把 config.example.ini 複製成 config.ini 並填入 api_id / api_hash")
    cp = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
    cp.read(CONFIG_PATH, encoding="utf-8-sig")

    api_id = cp.get("telegram", "api_id", fallback="").strip()
    api_hash = cp.get("telegram", "api_hash", fallback="").strip()
    if not api_id.isdigit() or not api_hash:
        sys.exit("config.ini 的 api_id / api_hash 尚未填寫（到 https://my.telegram.org 申請）")

    d = cp["download"] if cp.has_section("download") else {}
    exts = d.get("extensions", ".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx")
    cfg = {
        "api_id": int(api_id),
        "api_hash": api_hash,
        "save_dir": os.path.join(BASE_DIR, d.get("save_dir", "reports").strip()),
        "extensions": tuple(e.strip().lower() if e.strip().startswith(".") else "." + e.strip().lower()
                            for e in exts.split(",") if e.strip()),
        "history_limit": int(d.get("history_limit", "2000") or 0),
        "skip_own": str(d.get("skip_own", "true")).strip().lower() in ("1", "true", "yes", "y"),
        "max_size": int(float(d.get("max_size_mb", "100") or 0) * 1024 * 1024),
        "groups": [],
    }
    for sec in cp.sections():
        if not sec.lower().startswith("group."):
            continue
        chat = cp.get(sec, "chat", fallback="").strip()
        if not chat:
            continue
        topics = [t.strip() for t in cp.get(sec, "topic", fallback="").split(",") if t.strip()]
        cfg["groups"].append({"label": sec[6:], "chat": chat, "topics": topics})
    return cfg


# ---------------------------------------------------------------- 小工具
def safe_name(s, maxlen=120):
    s = re.sub(r'[\\/:*?"<>|\r\n\t]', "_", str(s)).strip(" .")
    return (s or "_")[:maxlen]


def load_state():
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            return set(json.load(f))
    except Exception:
        return set()


def save_state(state):
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(sorted(state), f)
    os.replace(tmp, STATE_PATH)


def topic_of(msg):
    """回傳訊息所屬的論壇主題 ID（General 主題 = 1）。"""
    r = msg.reply_to
    if isinstance(r, types.MessageReplyHeader) and r.forum_topic:
        return r.reply_to_top_id or r.reply_to_msg_id
    return 1


def sender_name(sender):
    if sender is None:
        return "unknown"
    if isinstance(sender, types.User):
        return " ".join(x for x in (sender.first_name, sender.last_name) if x) or sender.username or str(sender.id)
    return getattr(sender, "title", None) or str(sender.id)


async def get_topics(client, entity):
    """取得論壇型群組的所有主題 {id: title}。不是論壇則回傳 {}。"""
    if not getattr(entity, "forum", False):
        return {}
    req = getattr(functions.messages, "GetForumTopicsRequest", None)
    if req is not None:
        def make(off_date, off_id, off_topic):
            return req(peer=entity, offset_date=off_date, offset_id=off_id, offset_topic=off_topic, limit=100)
    else:  # 舊版 Telethon
        req = functions.channels.GetForumTopicsRequest

        def make(off_date, off_id, off_topic):
            return req(channel=entity, offset_date=off_date, offset_id=off_id, offset_topic=off_topic, limit=100)

    topics, off_date, off_id, off_topic = {}, None, 0, 0
    while True:
        res = await client(make(off_date, off_id, off_topic))
        new = [t for t in res.topics if isinstance(t, types.ForumTopic) and t.id not in topics]
        for t in new:
            topics[t.id] = t.title
        if not new or len(topics) >= res.count:
            break
        last = new[-1]
        top = next((m for m in res.messages if m.id == last.top_message), None)
        off_date, off_id, off_topic = (top.date if top else None), last.top_message, last.id
    topics.setdefault(1, "General")
    return topics


async def resolve_chat(client, chat):
    """chat 可以是數字 ID、@username、t.me 連結，或群組顯示名稱。"""
    target = chat
    if re.fullmatch(r"-?\d+", chat):
        target = int(chat)
    if isinstance(target, int) or chat.startswith("@") or "t.me/" in chat:
        try:
            return await client.get_entity(target)
        except Exception:
            pass
    # 依名稱比對（需完全相同；找不到再試「包含」）
    dialogs = [d for d in await client.get_dialogs() if d.is_group or d.is_channel]
    exact = [d for d in dialogs if d.name == chat]
    if not exact:
        exact = [d for d in dialogs if chat in d.name]
    if len(exact) == 1:
        return exact[0].entity
    if len(exact) > 1:
        names = "\n".join(f"  {d.id}  {d.name}" for d in exact)
        raise SystemExit(f"「{chat}」對應到多個群組，請在 config.ini 改填數字 ID：\n{names}")
    raise SystemExit(f"找不到群組「{chat}」，請執行 `python tg_reports.py list` 確認名稱或 ID")


# ---------------------------------------------------------------- 下載核心
class Downloader:
    def __init__(self, client, cfg):
        self.client = client
        self.cfg = cfg
        self.state = load_state()
        self.me = None
        self.targets = {}  # chat_id -> {"entity", "label", "topic_ids"(set|None), "topics"{id:title}}
        self.index_path = os.path.join(cfg["save_dir"], "index.csv")

    async def setup(self):
        self.me = await self.client.get_me()
        os.makedirs(self.cfg["save_dir"], exist_ok=True)
        for g in self.cfg["groups"]:
            ent = await resolve_chat(self.client, g["chat"])
            topics = await get_topics(self.client, ent)
            topic_ids = None
            if g["topics"]:
                if not topics:
                    print(f"[提醒] {g['label']} 不是論壇型群組，忽略 topic 設定，抓整個群組")
                else:
                    topic_ids = set()
                    for t in g["topics"]:
                        if t.isdigit() and int(t) in topics:
                            topic_ids.add(int(t))
                            continue
                        hit = [i for i, title in topics.items() if title == t] or \
                              [i for i, title in topics.items() if t.lower() in title.lower()]
                        if not hit:
                            avail = "、".join(topics.values())
                            raise SystemExit(f"{g['label']} 找不到主題「{t}」，現有主題：{avail}")
                        topic_ids.update(hit)
            self.targets[utils.get_peer_id(ent)] = {
                "entity": ent, "label": g["label"], "topic_ids": topic_ids, "topics": topics,
            }
            scope = "、".join(topics[i] for i in topic_ids) if topic_ids else "全部"
            print(f"監看：{utils.get_display_name(ent)}（主題：{scope}）")
        if not self.targets:
            raise SystemExit("config.ini 沒有設定任何 [group.xxx] 群組")

    def wanted(self, msg):
        if not msg.file or not isinstance(msg.media, types.MessageMediaDocument):
            return False
        if self.cfg["skip_own"] and msg.out:
            return False
        name = (msg.file.name or "").lower()
        ext = msg.file.ext or os.path.splitext(name)[1]
        if not (name.endswith(self.cfg["extensions"]) or (ext or "").lower() in self.cfg["extensions"]):
            return False
        if self.cfg["max_size"] and (msg.file.size or 0) > self.cfg["max_size"]:
            print(f"  略過（超過大小上限）：{msg.file.name}")
            return False
        return True

    async def handle(self, msg, chat_id):
        t = self.targets.get(chat_id)
        if t is None:
            return
        tid = topic_of(msg) if t["topics"] else None
        if t["topic_ids"] is not None and tid not in t["topic_ids"]:
            return
        if not self.wanted(msg):
            return
        key = f"{chat_id}:{msg.id}"
        if key in self.state:
            return

        sender = await msg.get_sender()
        who = sender_name(sender)
        local = msg.date.astimezone(TW)
        folder = os.path.join(self.cfg["save_dir"], safe_name(t["label"]))
        if tid is not None:
            folder = os.path.join(folder, safe_name(t["topics"].get(tid, f"topic{tid}")))
        os.makedirs(folder, exist_ok=True)

        orig = msg.file.name or f"file_{msg.id}{msg.file.ext or ''}"
        base, ext = os.path.splitext(safe_name(orig))
        fname = f"{local:%Y%m%d}_{base}{ext}"
        path = os.path.join(folder, fname)
        if os.path.exists(path):  # 同名不同檔 → 加上訊息編號
            path = os.path.join(folder, f"{local:%Y%m%d}_{base}_{msg.id}{ext}")

        part = path + ".part"
        try:
            await msg.download_media(file=part)
            os.replace(part, path)
        except Exception as e:
            print(f"  下載失敗：{orig}（{e}）")
            if os.path.exists(part):
                os.remove(part)
            return

        self.state.add(key)
        save_state(self.state)
        self.append_index(local, t, tid, who, orig, path, msg)
        print(f"  ✔ {local:%m/%d %H:%M} {who}：{orig}")

    def append_index(self, local, t, tid, who, orig, path, msg):
        new = not os.path.exists(self.index_path)
        with open(self.index_path, "a", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["日期時間", "群組", "主題", "傳送者", "原始檔名", "大小KB", "存檔路徑", "訊息文字", "訊息ID"])
            w.writerow([
                f"{local:%Y-%m-%d %H:%M}", t["label"],
                t["topics"].get(tid, "") if tid is not None else "",
                who, orig, round((msg.file.size or 0) / 1024),
                os.path.relpath(path, self.cfg["save_dir"]),
                (msg.message or "").replace("\n", " ")[:300], msg.id,
            ])

    async def fetch_history(self):
        limit = self.cfg["history_limit"] or None
        for chat_id, t in self.targets.items():
            print(f"\n== 補抓歷史：{t['label']}（最多 {limit or '全部'} 則）==")
            ids = sorted(t["topic_ids"]) if t["topic_ids"] else [None]
            for tid in ids:
                kw = {}
                if tid is not None and tid != 1:
                    kw["reply_to"] = tid  # 只讀這個主題裡的訊息
                async for msg in self.client.iter_messages(
                        t["entity"], limit=limit, filter=types.InputMessagesFilterDocument, **kw):
                    await self.handle(msg, chat_id)
        print("\n歷史補抓完成。")

    def listen(self):
        @self.client.on(events.NewMessage(chats=[t["entity"] for t in self.targets.values()]))
        async def _(event):
            await self.handle(event.message, event.chat_id)


# ---------------------------------------------------------------- 指令
async def cmd_list(client):
    print("你所在的群組 / 頻道：\n")
    for d in await client.get_dialogs():
        if not (d.is_group or d.is_channel):
            continue
        kind = "論壇群組" if getattr(d.entity, "forum", False) else ("頻道" if d.is_channel and not d.is_group else "群組")
        print(f"{d.id:>16}  [{kind}] {d.name}")
        if getattr(d.entity, "forum", False):
            try:
                for tid, title in (await get_topics(client, d.entity)).items():
                    print(f"{'':>20}主題 {tid:>6}：{title}")
            except Exception as e:
                print(f"{'':>20}（讀取主題失敗：{e}）")
    print("\n把想抓的群組名稱或 ID 填到 config.ini 的 [group.xxx] 區塊。")


async def main():
    cmd = (sys.argv[1] if len(sys.argv) > 1 else "watch").lower()
    if cmd not in ("list", "fetch", "watch"):
        sys.exit(__doc__)
    cfg = load_config()
    client = TelegramClient(SESSION_PATH, cfg["api_id"], cfg["api_hash"],
                            device_model="ReportReader", app_version="1.0")
    await client.start()  # 第一次會要求輸入手機號碼（+886...）與驗證碼
    try:
        if cmd == "list":
            await cmd_list(client)
            return
        dl = Downloader(client, cfg)
        await dl.setup()
        await dl.fetch_history()
        if cmd == "watch":
            dl.listen()
            print("\n持續監聽新報告中…（關閉視窗或按 Ctrl+C 結束）")
            await client.run_until_disconnected()
    finally:
        await client.disconnect()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n已停止。")
