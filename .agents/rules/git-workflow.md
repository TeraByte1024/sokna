---
description: Git 및 배포 작업 시 push 규칙
globs: ["**/*"]
---

# Git 워크플로우 규칙

1. **임의 Push 금지 (Strict No Push Without Approval)**:
   - 사용자의 명시적인 지시(`git push 해줘` 등)가 없는 한, **어떠한 경우에도 임의로 `git push` 명령어를 실행하지 않습니다.**
   - 로컬 작업 및 검증까지만 수행하며, 원격 저장소 푸시는 반드시 사용자의 확인과 지시가 있을 때만 진행합니다.
