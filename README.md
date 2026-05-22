# yakki-os Demo

> 일본 광고법·薬機法 위반 검사 + 한일 성분명 변환 도구 — **데모 버전**

🔗 **데모 URL**: https://xoxosuh.github.io/yakki-os-demo/

---

## 🎯 yakki-os란?

한국 화장품·건기식·식품을 일본 시장에 진출시키는 1인 실무자를 위한 도메인 특화 OS.

### 핵심 기능

- 🧪 **성분명 변환**: 한국어·영어·일본어 성분명 → JCIA 정식 표기 + INCI + 학명 + 식약처 표기 (4종 동시)
- ⚖️ **광고법 체크**: 일본어 카피의 薬機法·景品表示法 위반 검사 + 합법 대체 표현 3안 자동 생성
- ⭐ **즐겨찾기**: 자주 쓰는 성분 핀 + 메모 + 드래그 정렬
- 📦 **캐시 관리**: 한 번 검색하면 영구 캐시, 다음번 즉시 응답
- 🌍 **다국어 자동 매칭**: 전각·반각·대소문자·공백 차이 자동 통일

### 페르소나

**BEON** — Qoo10JP·AmazonJP 등 일본 시장 위탁 운영 1인 기업. 매일 한국 상품 정보를 JCIA 정식 표기로 변환하고 일본 광고법 검수.

### 작동 원리

```
사용자 → 브라우저 → Express 서버 → Claude Code CLI (subprocess)
                                       ├─ 도메인 분석 (Read·Glob)
                                       └─ 웹서치 검증 (WebSearch·WebFetch)
                       ↓
                  JSON 캐시 + 즐겨찾기
```

→ Claude Code 구독 활용으로 **API 호출 비용 0원** (대신 BEON 본인 PC에서만 작동)

---

## 🎯 이 데모는 뭐예요?

실제 yakki-os는 백엔드 + Claude CLI 가 필요해서 일반적인 클라우드 배포가 불가능합니다.

이 데모는 GitHub Pages에 정적 사이트로 올린 **미리보기 버전**이에요:

| | 실제 버전 (BEON PC) | 이 데모 |
|---|---|---|
| 검색 가능 성분 | 무한 (Claude가 매번 분석) | **미리 캐싱된 10개만** |
| 광고법 카피 분석 | 어떤 일본어든 분석 | **미리 만든 2개 샘플만** |
| 즐겨찾기·캐시 관리 | 영구 저장 (`data/favorites.json`) | 브라우저 LocalStorage |
| 비용 | 0원 (구독 활용) | 0원 (정적 호스팅) |

### 데모에서 검색 가능한 10개 성분

| 한국어 | 영어 | 일본어 |
|---|---|---|
| 히알루론산, 글루타치온, 세라마이드, 병풀추출물, 상황버섯추출물, 티트리잎오일 | Hydrolyzed Sodium Hyaluronate, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, PDRN | ヒアルロン酸Na |

### 데모에서 분석 가능한 광고법 카피 2개

1. **화장품 카피 (다중 위반)**:
   `シミが消える美白化粧水で若返り効果バツグン！医師も推奨の話題の商品。`

2. **건기식 카피 (효능 단정)**:
   `飲むだけで肌がプルプルに！コラーゲンドリンクで若返り、シワも改善。臨床試験で効果実証済み！`

---

## 📦 전체 코드

실제 yakki-os 코드: [github.com/xoxosuh/yakki-os](https://github.com/xoxosuh/yakki-os)

---

## 🏷 스폰지클럽 3회차 미션 정렬

- **미션 1**: B2C 페르소나(한국 화장품 일본 진출 1인 실무자) 위한 프로덕트 ✅
- **미션 2**: 4층 컨텍스트 하네스 + 오케스트레이션 (Claude + 웹서치 + JSON 캐시) ✅
- **미션 3**: SNS 게시 + 데모 배포 ✅

---

## 🛠 GitHub Pages 배포 방법 (BEON 본인용 메모)

이 폴더(`yakki-os-demo`) 통째로 GitHub 레포 만들어 푸시:

```bash
cd yakki-os-demo
git init
git add .
git commit -m "Initial demo deployment"
git branch -M main
git remote add origin https://github.com/xoxosuh/yakki-os-demo.git
git push -u origin main
```

GitHub 레포에서 **Settings → Pages → Source: main branch / (root)** 활성화 후 약 1~2분 대기.

→ `https://xoxosuh.github.io/yakki-os-demo/` 자동 생성.
