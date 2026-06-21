# 학습 설계 근거 (왜 이렇게 만들었나)

회화한입의 학습 방식은 추측이 아니라 **인지심리학·제2언어습득(SLA) 연구**와
성공한 학습 앱(Anki, Duolingo, Pimsleur, Babbel)의 검증된 패턴을 반영했습니다.

## 핵심 원칙 → 앱 반영

| 원칙 (근거) | 무엇 | 앱에서 |
|---|---|---|
| **분산 학습 (Spacing)** | 몰아서보다 나눠서 복습할 때 장기기억↑ | SRS: 10분→1시간→6시간→1일… 간격 자동 확대 (`srs.js`) |
| **인출 연습 / 테스트 효과 (Retrieval / Testing effect)** | "다시 보기"보다 **기억에서 꺼내기**가 훨씬 강력 | 본 카드는 **4가지 시험 활동**으로 출제 (아래) |
| **즉시 피드백 (Feedback)** | 정답/오답 즉시 확인 시 학습 효율↑ | 듣기·배열에서 바로 정답/해설 표시 |
| **다중감각 (Multimodal)** | 글+소리+발화 병행이 기억에 유리 | TTS 듣기 + STT 발화 + 텍스트 |
| **이해 가능한 입력 (Krashen i+1)** | 약간 윗단계의 이해되는 입력 | 기초 우선 + 뜻/예문 제공, 새 표현은 먼저 "가르치기" |
| **출력 가설 (Swain Output)** | 직접 말/문장을 **생산**해야 진짜 습득 | 영어로 떠올려 말하기(KO→EN), 문장 배열 |
| **바람직한 어려움 (Bjork)** | 적당히 힘든 인출이 기억을 강화 | 정답 보기 **전에** 먼저 떠올리게 함 |
| **교차 학습 (Interleaving)** | 주제·활동을 섞으면 변별·전이↑ | 매 카드 활동 유형을 번갈아 출제, 기초/중급 혼합 |
| **낮은 정서적 장벽 (Affective filter)** | 말하기 불안이 높으면 습득 방해 | 음성인식 안 돼도 자가체크 / 문장 배열 같은 저부담 출력 |
| **습관화·동기 (Fogg, 게이미피케이션)** | 작게·자주·보상 | 1분 세션, 스트릭🔥/XP/레벨/콤보/일일목표 (`game.js`) |

## 세션의 활동 4종 (인출 중심)

1. **🆕 가르치기(teach)** — *새 표현 첫 노출.* 보고·듣고·따라 말하기 + 바꿔 말하기 드릴.
   (이해 가능한 입력 + 비계 설정된 출력)
2. **🧠 떠올려 말하기(recall, KO→EN)** — 한국어만 보고 **영어를 먼저 생산**한 뒤 정답 확인.
   (테스트 효과 + 출력 + 바람직한 어려움)
3. **🎧 듣고 고르기(listen, EN→KO)** — 음성만 듣고 뜻 선택, 즉시 피드백.
   (입력 + 저부담 인출 + 청취)
4. **🧩 문장 배열(wordbank)** — 단어 타일로 문장 재구성.
   (어순·형태 주의를 동반한 비계형 출력)

> 새 카드는 항상 **가르치기**로 시작합니다 — 본 적 없는 걸 인출할 수는 없으니까요.
> 한 번이라도 본 카드는 위 2~4번을 번갈아 출제해 **매번 다르게, 매번 머리를 쓰게** 만듭니다.

## 의도적으로 "안 한" 것
- 단어 하나하나 암기(X) → **표현/덩어리(chunk)** 단위 (어휘 접근법, Lewis)
- 객관식만 반복(X) → 인식보다 **생산/인출** 비중을 높임
- 길고 무거운 강의(X) → **1~2분 마이크로러닝**으로 자주

## 다음에 더 해볼 만한 것
- SRS를 SM-2 → **FSRS**(더 정확한 망각곡선 모델)로 고도화
- 오답·약한 카드 자동 가중 복습("약점 집중")
- 받아쓰기(dictation), 빈칸 채우기(cloze) 활동 추가
- 스트릭 프리즈(하루 빠져도 보호) 등 이탈 방지 장치

## 참고 (근거)
- The science of effective learning with spacing and retrieval practice — *Nature Reviews Psychology* (2022): https://www.nature.com/articles/s44159-022-00089-1
- Spacing, feedback, and testing boost vocabulary learning in a web application — *PMC*: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8638698/
- Spacing & retrieval practice guide — *Australian Education Research Organisation*: https://www.edresearch.edu.au/guides-resources/practice-guides/spacing-and-retrieval-practice-guide-full-publication
- Krashen, *Principles and Practice in SLA* (Input Hypothesis): https://sdkrashen.com/content/books/principles_and_practice.pdf
- Swain, Output Hypothesis (개요): https://en.wikipedia.org/wiki/Comprehensible_output
