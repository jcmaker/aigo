import json

from app.models import PushDevice
from app.push import notify_analysis
from sqlalchemy import select

T1, T2 = "ExponentPushToken[one]", "ExponentPushToken[two]"


def add(db, user, *tokens):
    for t in tokens:
        db.add(PushDevice(token=t, user_id=user.id, platform="android"))
    db.commit()


def recorder(reply=None):
    sent = []

    def send(msgs):
        sent.append(msgs)
        return reply if reply is not None else [{"status": "ok"}] * len(msgs)
    return sent, send


def test_notify_ignores_send_failure(db, user, caplog):
    add(db, user, T1)

    def boom(_):
        raise TimeoutError("expo down")
    notify_analysis(db, user.id, 7, True, send=boom)  # 예외가 나오면 실패
    assert "푸시 발송 실패" in caplog.text
    assert db.scalar(select(PushDevice)) is not None


def test_notify_survives_garbage_response(db, user):
    add(db, user, T1)
    notify_analysis(db, user.id, 7, True, send=lambda m: [None])
    notify_analysis(db, user.id, 7, True, send=lambda m: "x")


def test_notify_removes_unregistered_token(db, user):
    add(db, user, T1, T2)
    order = list(db.scalars(select(PushDevice.token).where(PushDevice.user_id == user.id)))
    reply = [{"status": "error", "details": {"error": "DeviceNotRegistered"}} if t == T2
             else {"status": "ok"} for t in order]
    sent, send = recorder(reply)
    notify_analysis(db, user.id, 7, True, send=send)
    assert [m["to"] for m in sent[0]] == order  # 한 번에 배열로
    assert [d.token for d in db.scalars(select(PushDevice))] == [T1]


def test_notify_text_has_no_accident_details(db, user):
    add(db, user, T1)
    sent, send = recorder()
    notify_analysis(db, user.id, 7, True, send=send)
    notify_analysis(db, user.id, 8, False, send=send)
    assert sent[0][0] == {"to": T1, "title": "AIGO", "body": "분석이 끝났습니다.", "data": {"analysis_id": 7}}
    assert sent[1][0]["body"] == "분석에 실패했습니다." and sent[1][0]["data"] == {"analysis_id": 8}
    assert set(json.loads(json.dumps(sent[1][0]))) == {"to", "title", "body", "data"}


def test_notify_skips_without_user_or_tokens(db, user):
    sent, send = recorder()
    notify_analysis(db, None, 7, True, send=send)
    notify_analysis(db, user.id, 7, True, send=send)
    assert sent == []
