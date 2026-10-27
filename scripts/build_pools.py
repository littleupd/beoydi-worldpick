"""
비여디 지구뽑기 - 구간별 도시 풀 생성 스크립트

사용법
1) https://download.geonames.org/export/dump/ 에서 cities1000.zip 다운로드 후 압축 해제
   (cities1000.txt)
2) python build_pools.py cities1000.txt
3) 생성된 pools.json 을 사이트의 data 폴더에 넣기

구간: famous(유명) / mid(중간) / small(작은 도시) / danger(위험·오지)
"""
import json
import sys

# ---- 설정 ---------------------------------------------------------------
MID_MIN, MID_MAX = 50_000, 1_000_000   # 중간 도시 인구 범위
SMALL_MIN = 15_000                     # 작은 도시 최소 인구
FAMOUS_MIN = 15_000                    # 유명 도시 매칭 시 최소 인구(동명 마을 방지)

# 위험 구간 국가코드 - 반드시 외교부 해외안전여행(0404.go.kr) 최신 정보로 직접 확인/수정하세요.
DANGER_CC = {"AF", "IQ", "SY", "SO", "YE", "LY", "UA"}

# 유명 관광 도시 (GeoNames 영문명|국가코드, ; 로 구분). 자유롭게 추가/삭제하세요.
FAMOUS_RAW = """
Paris|FR;London|GB;Rome|IT;Barcelona|ES;Madrid|ES;Amsterdam|NL;Berlin|DE;Munich|DE;
Prague|CZ;Vienna|AT;Budapest|HU;Venice|IT;Florence|IT;Milan|IT;Naples|IT;Lisbon|PT;
Porto|PT;Athens|GR;Istanbul|TR;Dubai|AE;Abu Dhabi|AE;Cairo|EG;Marrakesh|MA;
Cape Town|ZA;New York City|US;Los Angeles|US;San Francisco|US;Las Vegas|US;Miami|US;
Chicago|US;Honolulu|US;Vancouver|CA;Toronto|CA;Montreal|CA;Cancun|MX;Mexico City|MX;
Rio de Janeiro|BR;Buenos Aires|AR;Lima|PE;Cusco|PE;Havana|CU;Tokyo|JP;Kyoto|JP;
Osaka|JP;Sapporo|JP;Fukuoka|JP;Nagoya|JP;Seoul|KR;Busan|KR;Jeju|KR;Beijing|CN;
Shanghai|CN;Hong Kong|HK;Macau|MO;Taipei|TW;Bangkok|TH;Phuket|TH;Chiang Mai|TH;
Hanoi|VN;Ho Chi Minh City|VN;Da Nang|VN;Singapore|SG;Kuala Lumpur|MY;Denpasar|ID;
Jakarta|ID;Manila|PH;Cebu City|PH;Siem Reap|KH;Kathmandu|NP;New Delhi|IN;Delhi|IN;
Mumbai|IN;Jaipur|IN;Sydney|AU;Melbourne|AU;Auckland|NZ;Reykjavik|IS;Copenhagen|DK;
Stockholm|SE;Oslo|NO;Helsinki|FI;Dublin|IE;Edinburgh|GB;Zurich|CH;Geneva|CH;
Brussels|BE;Bruges|BE;Nice|FR;Seville|ES;Sevilla|ES;Valencia|ES;Dubrovnik|HR;
Split|HR;Salzburg|AT;Krakow|PL;Doha|QA;Nairobi|KE
"""
FAMOUS_SET = {
    tuple(x.strip().split("|"))
    for x in FAMOUS_RAW.replace("\n", "").split(";")
    if x.strip()
}


def main(path):
    pools = {"famous": [], "mid": [], "small": [], "danger": []}
    with open(path, encoding="utf-8") as f:
        for line in f:
            c = line.rstrip("\n").split("\t")
            if len(c) < 15:
                continue
            gid, name, ascii_name, alts = c[0], c[1], c[2], c[3]
            lat, lon, cc, admin1, pop = c[4], c[5], c[8], c[10], int(c[14] or 0)
            # [id, 이름(영문), 국가코드, 행정구역코드, 위도, 경도, 인구]
            row = [int(gid), ascii_name or name, cc, admin1,
                   round(float(lat), 3), round(float(lon), 3), pop]

            if cc in DANGER_CC:
                if pop >= SMALL_MIN:
                    pools["danger"].append(row)
                continue

            names = {name, ascii_name}
            if pop >= FAMOUS_MIN and any((n, cc) in FAMOUS_SET for n in names):
                pools["famous"].append(row)
            elif MID_MIN <= pop < MID_MAX:
                pools["mid"].append(row)
            elif SMALL_MIN <= pop < MID_MIN:
                pools["small"].append(row)
            # 그 외(1.5만 미만, 100만 초과 비유명)는 제외

    for k, v in pools.items():
        print(f"{k}: {len(v)}")
    with open("pools.json", "w", encoding="utf-8") as out:
        json.dump(pools, out, ensure_ascii=False, separators=(",", ":"))
    print("pools.json 생성 완료")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("python build_pools.py cities1000.txt")
        sys.exit(1)
    main(sys.argv[1])
