"""
Canonical bunkering port list (PT-09, E7). Shared between
scripts/scrape_bunker_prices.py (write side — normalizes OCR'd port name
strings against this list before insert) and the frontend's bunkering-port
selectbox (read side — dropdown options). Kept in one place so the two
sides can't drift out of sync with each other.

Source: seatraderhk.com/report.php, observed 2026-07-17. Per client
confirmation (2026-07-17), this ~35-port list IS the intended dropdown
scope — not merged with the (much larger, ~550-port) routes_clean.xlsx
loading/discharge port list, which serves a different purpose (cargo
routes, not bunkering hubs).
"""

KNOWN_PORTS: list[str] = [
    "VLADIVOSTOK", "VOSTOCHNY", "NAKHODKA", "VANINO",
    "TOKYO", "BUSAN", "INCHON", "QINGDAO", "SHANGHAI", "ZHOUSHAN",
    "HONGKONG", "KAOHSIUNG", "TAICHUNG", "SINGAPORE", "PORT KLANG",
    "BANGKOK", "KOSICHANG", "HOCHIMINH", "HAIPHONG",
    "COLOMBO", "PORT LOUIS",
    "ROTTERDAM", "HAMBURG", "ANTWERP", "PIRAEUS", "GIBRALTAR",
    "ST.PETERSBURG", "UST-LUGA", "FUJAIRAH",
    "NEW YORK", "HOUSTON", "LOS ANGELES", "RIO DE JANEIRO",
    "DURBAN", "CAPETOWN",
]

# Bilingual display labels — lets Streamlit's selectbox typeahead match on
# a Chinese substring too (it searches the rendered option text, not the
# underlying value), same convention as the rest of the Input panel
# (e.g. "Route · 航线").
PORT_NAMES_ZH: dict[str, str] = {
    "VLADIVOSTOK": "符拉迪沃斯托克",
    "VOSTOCHNY": "东方港",
    "NAKHODKA": "纳霍德卡",
    "VANINO": "瓦尼诺",
    "TOKYO": "东京",
    "BUSAN": "釜山",
    "INCHON": "仁川",
    "QINGDAO": "青岛",
    "SHANGHAI": "上海",
    "ZHOUSHAN": "舟山",
    "HONGKONG": "香港",
    "KAOHSIUNG": "高雄",
    "TAICHUNG": "台中",
    "SINGAPORE": "新加坡",
    "PORT KLANG": "巴生港",
    "BANGKOK": "曼谷",
    "KOSICHANG": "科西昌岛",
    "HOCHIMINH": "胡志明市",
    "HAIPHONG": "海防",
    "COLOMBO": "科伦坡",
    "PORT LOUIS": "路易港",
    "ROTTERDAM": "鹿特丹",
    "HAMBURG": "汉堡",
    "ANTWERP": "安特卫普",
    "PIRAEUS": "比雷埃夫斯",
    "GIBRALTAR": "直布罗陀",
    "ST.PETERSBURG": "圣彼得堡",
    "UST-LUGA": "乌斯季卢加",
    "FUJAIRAH": "富查伊拉",
    "NEW YORK": "纽约",
    "HOUSTON": "休斯顿",
    "LOS ANGELES": "洛杉矶",
    "RIO DE JANEIRO": "里约热内卢",
    "DURBAN": "德班",
    "CAPETOWN": "开普敦",
}
