# Kế Hoạch Tiếp Tục Phát Triển Dự Án Git Graph Extension

> **Tài liệu nguồn tham chiếu:** `spec.md`, `IMPLEMENTATION_PLAN.md`, `AGENTS.md`  
> **Trạng thái hiện tại:** Hoàn thành toàn bộ Milestone 0 → 14 (Phase 1 → Phase 6: MVP Core, Virtualized SVG Graph, Toàn bộ Git Operations UI Dialogs, Quản lý Working Tree & Stash, Multi-Commit Diff, Bộ lọc nâng cao, Tích hợp VS Code Ecosystem, Stress Benchmarking & Marketplace Packaging).  
> **Chất lượng hiện tại:** 107 test suites (923 unit/integration tests) pass 100%, 0 lỗi TypeScript, 0 lỗi Lint, 100% Prettier format.  
> **Mục tiêu:** Nâng cấp Git Graph từ phiên bản MVP lên phiên bản Production-Ready hoàn thiện, bổ sung toàn diện các thao tác Git nâng cao, giao diện tương tác Working Tree, Stash, bộ lọc chuyên sâu và trải nghiệm người dùng đạt chuẩn VS Code hàng đầu.

---

## 1. Đánh Giá Hiện Trạng & Phân Tích Khoảng Trống (Gap Analysis)

### 1.1. Những Gì Đã Hoàn Thành Vững Chắc
1. **Kiến trúc Monorepo & Tuân thủ ranh giới:**
   - Phân tầng tách bạch giữa `apps/extension`, `apps/webview`, `packages/git-core`, `packages/git-graph`, `packages/shared`.
   - Webview ↔ Extension giao tiếp 100% qua typed `MessageEnvelope` được kiểm chứng bằng Zod schema tại `packages/shared`.
2. **Graph Topology Engine:**
   - Thuật toán `LaneAllocator`, `buildSegments`, `GraphContinuation` phân trang không bị gãy nét, hỗ trợ đầy đủ các topology phức tạp (linear, branch, merge, multiple merge, octopus merge).
   - Render SVG ảo hóa với `@tanstack/react-virtual`, row-band quantization, tối ưu O(1) tra cứu commit.
3. **Backend Git Operations:**
   - `GitOperationService` đã hỗ trợ đầy đủ luồng thực thi an toàn kèm `OperationQueue`, `OperationPreflight`, `OperationResult` cho: Checkout, Create/Rename/Delete Branch, Push, Tag, Merge, Abort Merge, Rebase (Continue/Abort/Skip), Cherry-pick (Continue/Abort/Skip), Revert (Continue/Abort/Skip), Reset (Soft/Mixed/Hard), Fetch.
4. **Hệ thống Design System & UI Primitives:**
   - Bộ UI primitives chuẩn mực tại `apps/webview/src/components/ui/`: `Modal`, `Button`, `TextInput`, `Checkbox`, `RadioGroup`, `SelectField`, `Icon`, `Toast`.
   - Các hook dùng chung: `useCommitRows`, `useMaxGraphLane`, `useDistinctOptions`, `useToast`.
   - Đã chuẩn hóa 4 dialogs: `CompareBranchDialog`, `CreateBranchDialog`, `DeleteBranchDialog`, `RenameBranchDialog`.

### 1.2. Những Khoảng Trống Cần Tiếp Tục Phát Triển (Gaps)
1. **Thiếu UI Dialogs cho các Git Operations đã có ở Backend:**
   - Mặc dù backend đã hỗ trợ Merge, Rebase, Reset, Cherry-pick, Revert, Create/Delete Tag, nhưng giao diện Webview hiện tại chưa có Dialog chuyên dụng cho các tác vụ này (chỉ có banner conflict hoặc gọi ngầm/prompt giản lược).
2. **Chưa có giao diện tương tác Working Tree (Uncommitted Changes):**
   - Đã render được dòng `* Uncommitted Changes (${dirtyCount})` ở đầu danh sách, nhưng khi click vào chưa có giao diện quản lý file staged/unstaged, chưa hỗ trợ Stage (+), Unstage (-), Discard changes, và Commit form trực tiếp từ Webview.
3. **Chưa hỗ trợ Quản lý Stash:**
   - Chưa có thao tác Stash Save, Stash Pop, Stash Apply, Stash Drop và xem danh sách Stashes.
4. **So sánh Diff giữa 2 Commit bất kỳ (Multi-Commit Selection):**
   - Store đã có `secondarySelectedCommitSha`, nhưng `CommitDetailsPanel` chưa hiển thị diff so sánh giữa 2 commit được chọn tùy ý.
5. **Bộ lọc & Sắp xếp chuyên sâu (Advanced Filters):**
   - Thiếu Date Range picker (hôm nay, 7 ngày, 30 ngày, tùy chọn ngày bắt đầu - kết thúc).
   - Thiếu File/Path History filter (`git log -- <path>`).
   - Thiếu tùy chọn đổi thứ tự duyệt commit: `--date-order`, `--topo-order`, `--author-date-order`.
6. **Tích hợp sâu vào VS Code (Ecosystem Integration):**
   - Thiếu command "View File History" từ context menu file Explorer / Editor.
   - Thiếu Status Bar Item hiển thị nhánh và mở Git Graph nhanh.
   - Thiếu chức năng mở xem file tại revision cụ thể trong VS Code editor (`git-graph-revision://`).

---

## 2. Lộ Trình Phát Triển (Roadmap) Theo Các Giai Đoạn

```text
Phase 1: Hoàn Thiện Bộ UI Dialogs Cho Git Operations
  ├── M9.1: Create Tag & Delete Tag Dialogs
  ├── M9.2: Merge Dialog (Fast-forward, Squash, No-commit)
  ├── M9.3: Rebase Dialog & Upstream Detection
  ├── M9.4: Reset Dialog (Soft/Mixed/Hard với Dangerous Guard)
  └── M9.5: Cherry-pick & Revert Dialogs (Mainline Parent Picker)

Phase 2: Quản Lý Working Tree & Stash Trực Tiếp Trên Webview
  ├── M10.1: Uncommitted Changes Explorer (Staged vs Unstaged)
  ├── M10.2: Stage, Unstage & Discard Actions
  ├── M10.3: Direct Commit Form (Message, Description, Amend)
  └── M10.4: Git Stash Lifecycle (Save, Pop, Apply, Drop, List)

Phase 3: Multi-Commit Diff & So Sánh Tùy Biến
  ├── M11.1: Range Diff Protocol (shaA..shaB)
  ├── M11.2: Multi-selection UX (Ctrl/Cmd + Click)
  └── M11.3: Comparison Details Panel & File Diff Matrix

Phase 4: Bộ Lọc Lịch Sử & Sắp Xếp Nâng Cao
  ├── M12.1: Date Range Filter (Preset & Custom Range)
  ├── M12.2: File & Directory Path Filter ("View History for Path")
  └── M12.3: Commit Ordering Strategy (--date-order, --topo-order)

Phase 5: Tích Hợp VS Code Ecosystem & Advanced UX
  ├── M13.1: VS Code Explorer & Editor Context Menu Integrations
  ├── M13.2: Status Bar Item với Live Branch/Ahead-Behind
  ├── M13.3: Open File at Revision & Native Diff Integration
  ├── M13.4: Keyboard Navigation (Arrow Keys, Enter, Space, Esc)
  └── M13.5: Resizable Columns & Compact Mode

Phase 6: Hiệu Năng Quy Mô Lớn, Kiểm Thử & Phát Hành Marketplace
  ├── M14.1: Benchmark & Memory Profiling (50K - 100K commits)
  ├── M14.2: E2E Integration Suite Mở Rộng
  └── M14.3: Đóng Gói VSIX, Tài Liệu Hoàn Chỉnh & CI/CD Release
```

---

## 3. Kế Hoạch Chi Tiết Từng Milestone

### Giai Đoạn 1: Hoàn Thiện Bộ UI Dialogs Cho Git Operations (Phase 1)

Mục tiêu: Đưa toàn bộ các backend operation đã có thành các Dialog trực quan, thẩm mỹ, an toàn, tái sử dụng 100% `Modal` và UI primitives theo quy chuẩn `AGENTS.md`.

#### M9.1 — Create Tag & Delete Tag Dialogs
- **Nội dung:**
  - `CreateTagDialog.tsx`:
    - Target commit SHA (hiển thị short SHA và commit subject tóm tắt).
    - Tên tag (`TextInput`), validate ký tự hợp lệ của Git ref name.
    - Radio chọn loại tag: Lightweight vs Annotated.
    - Textarea nhập nội dung message (chỉ kích hoạt khi là Annotated tag).
    - Checkbox tùy chọn "Push tag to remote".
  - `DeleteTagDialog.tsx`:
    - Xác nhận xóa tag local.
    - Checkbox tùy chọn "Delete tag on remote" (kèm chọn remote nếu có nhiều remotes).
  - Kết nối context menu trên badge tag và commit context menu.
- **Protocol:** Đã có `operation.tag.create.request`, bổ sung `operation.tag.delete.request`.
- **Verify:** Unit test component render, validation error khi tên tag trống/sai định dạng, submit đúng payload.

#### M9.2 — Merge Dialog
- **Nội dung:**
  - `MergeDialog.tsx`:
    - Hiển thị rõ ràng: Nhánh nguồn (source branch/commit) sẽ được merge vào Nhánh hiện tại (current HEAD).
    - Chọn Fast-forward mode: `Default (fast-forward if possible)`, `No fast-forward (--no-ff)`, `Fast-forward only (--ff-only)`.
    - Checkbox `--squash` (Squash commits thành 1 commit duy nhất).
    - Checkbox `--no-commit` (Thực hiện merge trong working tree nhưng không tự động commit).
  - Tích hợp với `requestMerge` đã có sẵn.
- **Verify:** Test chọn các option, hiển thị đúng thông tin nhánh nguồn/đích, xử lý khi branch dirty qua preflight.

#### M9.3 — Rebase Dialog
- **Nội dung:**
  - `RebaseDialog.tsx`:
    - Hiển thị: Rebase nhánh hiện tại lên target ref/branch.
    - Cảnh báo trực quan (warning icon) nếu nhánh hiện tại đã được push lên remote (tránh rebase branch công khai làm xáo trộn history của đồng nghiệp).
    - Checkbox xác nhận: "I understand the risks of rewriting published history".
    - Checkbox `--ignore-date` (cập nhật committer date về hiện tại).
  - Tích hợp với `requestRebase` và chuỗi conflict sequencer banner (Continue/Abort/Skip).
- **Verify:** Cảnh báo khi published branch, nút Rebase bị disabled khi chưa tick xác nhận rủi ro.

#### M9.4 — Reset Dialog (Soft, Mixed, Hard với Dangerous Guard)
- **Nội dung:**
  - `ResetDialog.tsx`:
    - Hiển thị target commit (hash, subject, author, date).
    - 3 tùy chọn chế độ reset với giải thích rõ ràng:
      + **Soft (`--soft`):** Giữ nguyên file thay đổi trong Staging area (Index).
      + **Mixed (`--mixed` - Mặc định):** Giữ nguyên file thay đổi trong Working directory, bỏ unstaged.
      + **Hard (`--hard`):** Hủy toàn bộ thay đổi trong working directory và index.
    - Đối với chế độ **Hard**:
      + Đổi style khung cảnh báo sang màu đỏ (danger banner).
      + Bắt buộc tích vào Checkbox: "Discard all uncommitted changes permanently".
      + Nút Submit đổi thành "Reset (Hard)" màu đỏ.
  - Tích hợp với `requestReset`.
- **Verify:** Test chuyển đổi giữa 3 mode, validation bắt buộc checkbox khi chọn Hard mode.

#### M9.5 — Cherry-pick & Revert Dialogs
- **Nội dung:**
  - `CherryPickDialog.tsx`:
    - Xem lại commit sẽ cherry-pick.
    - Nếu commit được chọn là Merge Commit (có >= 2 parents): Hiển thị dropdown chọn Mainline Parent (`-m 1` hoặc `-m 2`), hiển thị rõ parent SHA và parent branch/subject để tránh cherry-pick nhầm nhánh.
    - Checkbox `--no-commit` (`-n`).
  - `RevertDialog.tsx`:
    - Tương tự, hỗ trợ chọn Mainline Parent cho merge commit (`git revert -m <parent-number>`).
- **Verify:** Test hiển thị parent selector khi commit có 2 parents, ẩn khi commit thông thường.

---

### Giai Đoạn 2: Quản Lý Working Tree & Stash Trực Tiếp (Phase 2)

Mục tiêu: Đưa Git Graph trở thành trung tâm điều khiển Git hàng ngày, người dùng có thể stage, unstage, commit và stash ngay trên giao diện mà không cần rời mắt khỏi đồ thị.

#### M10.1 — Uncommitted Changes Detail Panel
- **Nội dung:**
  - Khi click vào dòng `* Uncommitted Changes`:
    - Details panel hiển thị 2 khu vực rõ ràng: **Staged Changes** và **Changes (Unstaged)**.
    - Mỗi file hiển thị: Trạng thái (Modified `M`, Added `A`, Deleted `D`, Untracked `U`, Renamed `R`), đường dẫn file.
    - Nút thao tác nhanh trên từng file:
      + Nút `+` (Stage file) đối với unstaged/untracked file.
      + Nút `-` (Unstage file) đối với staged file.
      + Nút `Trash` (Discard changes) kèm confirmation dialog nhỏ.
      + Nút `Open Diff` (mở diff so sánh với index hoặc HEAD).
    - Nút thao tác hàng loạt trên header: "Stage All", "Unstage All", "Discard All Changes".
- **Protocol:**
  - `worktree.status.request` → trả về danh sách staged files và unstaged files.
  - `worktree.stage.request` (`paths: string[]`, `all?: boolean`).
  - `worktree.unstage.request` (`paths: string[]`, `all?: boolean`).
  - `worktree.discard.request` (`paths: string[]`, `all?: boolean`).

#### M10.2 — Direct Commit Form
- **Nội dung:**
  - Tích hợp khung soạn thảo commit ở dưới danh sách Uncommitted Changes:
    - Textbox `Commit summary` (dòng đầu, giới hạn khuyến nghị 50-72 ký tự).
    - Textarea `Description` (tùy chọn, mô tả chi tiết).
    - Checkbox `Amend previous commit` (nếu tick, tự động load message của commit HEAD gần nhất vào form).
    - Nút "Commit Changes" (chỉ kích hoạt khi có ít nhất 1 file staged hoặc khi amend, và summary không trống).
- **Protocol:**
  - `operation.commit.create.request` (`message: string`, `description?: string`, `amend?: boolean`).
- **Verify:** Integration test chạy qua temp git repo: stage 2 file, commit, assert graph tự động reload và hiển thị commit mới nhất.

#### M10.3 — Git Stash Lifecycle Management
- **Nội dung:**
  - `StashSaveDialog.tsx`:
    - Nhập Stash message (tùy chọn).
    - Checkbox `Include untracked files` (`-u`).
    - Checkbox `Keep staged changes` (`--keep-index`).
  - Hiển thị Stashes:
    - Hiển thị badge hoặc dòng đánh dấu Stash trong Commit List (hoặc mục Stashes riêng biệt trên Toolbar).
  - Tác vụ trên Stash (qua context menu hoặc menu stashes):
    - **Apply Stash** (`git stash apply stash@{n}`).
    - **Pop Stash** (`git stash pop stash@{n}`).
    - **Drop Stash** (`git stash drop stash@{n}`) kèm xác nhận.
- **Protocol:**
  - `stash.list.request` / `stash.save.request` / `stash.pop.request` / `stash.apply.request` / `stash.drop.request`.
- **Verify:** Test lưu stash khi repo dirty, apply stash và drop stash an toàn.

---

### Giai Đoạn 3: Multi-Commit Diff & So Sánh Tùy Biến (Phase 3) [Đã hoàn thành]

Mục tiêu: Cho phép lập trình viên so sánh bất kỳ 2 commit nào (ví dụ trước và sau khi release, hoặc giữa 2 mốc tính năng).

#### M11.1 — Multi-selection UX [Hoàn thành]
- **Nội dung:**
  - Hỗ trợ chọn 2 commit:
    - Click vào commit thứ nhất -> trở thành `selectedCommitSha`.
    - Giữ phím `Ctrl` (Windows/Linux) hoặc `Cmd` (macOS) và click vào commit thứ hai -> gán vào `secondarySelectedCommitSha`.
    - Dòng commit thứ hai được highlight với class `secondary-selected` (đã có CSS trong `theme.css`).
    - Nhấn `Esc` hoặc click ra ngoài bỏ chọn secondary commit.
- **Verify:** Đã bổ sung unit/regression test trong `GitGraphView.test.tsx` và `CommitRow.test.tsx`.

#### M11.2 — Arbitrary Range Diff Engine & Panel [Hoàn thành]
- **Nội dung:**
  - Khi có 2 commit được chọn:
    - Header của `CommitDetailsPanel` chuyển sang chế độ "Compare Commits":
      + Hiển thị `Commit A (cũ hơn)` ↔ `Commit B (mới hơn)`.
      + Số lượng commits giữa 2 mốc (`A..B`), số file thay đổi, tổng số dòng thêm/bớt (`+X / -Y`).
    - Danh sách file thay đổi được tính bằng `git diff --name-status shaA shaB`.
    - Click vào file mở DiffViewer so sánh nội dung giữa `shaA:path` và `shaB:path`.
- **Protocol:**
  - `commit.diff.request`, `diff.open.request`, và `commit.details.request` mở rộng nhận thêm `baseSha` và `targetSha` linh hoạt.
  - `CommitDetailsQuery` và `DiffQuery` hỗ trợ so sánh arbitrary range và tính `commitCount` qua `rev-list --count`.
- **Verify:** Đã có đầy đủ unit tests trong `CommitDetailsPanel.test.tsx`, `DiffViewer.test.tsx`, `CommitDetailsQuery.unit.test.ts`, và `DiffQuery.unit.test.ts`.

---

### Giai Đoạn 4: Bộ Lọc & Sắp Xếp Nâng Cao (Phase 4)

Mục tiêu: Nâng cao năng lực tra cứu trên các repository có hàng nghìn commit và lịch sử nhánh chằng chịt.

#### M12.1 — Date Range Filter
- **Nội dung:**
  - Thêm dropdown bộ lọc ngày trên Toolbar:
    - Presets: `All Time`, `Today`, `Last 7 Days`, `Last 30 Days`, `Custom Range...`.
    - `Custom Range`: Modal chọn ngày bắt đầu (`Since`) và ngày kết thúc (`Until`).
  - Gửi tham số `dateSince` và `dateUntil` xuống `CommitQuery` (`--after`, `--before`).
  - Hiển thị badge ngày đang áp dụng trên `ActiveFiltersBar` với nút `x` để xóa nhanh.

#### M12.2 — File & Directory Path Filter ("View History for Path")
- **Nội dung:**
  - Cho phép người dùng lọc commit chỉ tác động tới một file hoặc thư mục cụ thể (`git log -- <path>`).
  - Thêm ô chọn/nhập file path trên Toolbar hoặc qua lệnh context menu của VS Code.
  - Khi kích hoạt filter path:
    - Graph hiển thị các commit chạm vào path đó.
    - Thêm badge trên `ActiveFiltersBar`: `Path: src/components/ui/Button.tsx`.

#### M12.3 — Commit Ordering Strategy
- **Nội dung:**
  - Thêm tùy chọn sắp xếp commit trong `ViewConfigMenu`:
    - **Date Order (`--date-order` - Mặc định):** Commits hiển thị theo thứ tự thời gian commit, không có commit con nào xuất hiện trước cha của nó.
    - **Topological Order (`--topo-order`):** Không để các commit từ các nhánh đan xen vào nhau, giữ các nhánh gom cụm liền mạch.
    - **Author Date Order (`--author-date-order`):** Sắp xếp theo ngày tạo ban đầu của tác giả.
  - Lưu cấu hình vào `configStore` và VS Code workspace settings.

---

### Giai Đoạn 5: Tích Hợp VS Code Ecosystem & Advanced UX (Phase 5)

Mục tiêu: Đưa trải nghiệm tương tác lên tầm native, mượt mà và trực quan nhất.

#### M13.1 — VS Code Context Menu & Commands [x]
- **Nội dung:**
  - Bổ sung lệnh và menu contribution vào `apps/extension/package.json`:
    - `gitGraph.viewFileHistory`:
      + Xuất hiện khi click chuột phải vào file trong VS Code File Explorer và Editor Title Context Menu.
      + Mở Git Graph và tự động kích hoạt Path filter trỏ tới file được chọn.
    - `gitGraph.openFileAtRevision`:
      + Click chuột phải vào file trong ChangedFiles -> "Open File in Editor".
      + Cho phép mở file ở phiên bản commit hiện tại (read-only qua custom TextDocumentContentProvider `git-graph-revision://`).

#### M13.2 — Live Status Bar Item [x]
- **Nội dung:**
  - Thêm item trên VS Code Status Bar:
    - Hiển thị: `$(git-branch) [Tên nhánh]` kèm số commit ahead/behind so với remote (`↑2 ↓1`).
    - Tooltip: "Open Git Graph (Workspace)".
    - Click vào item sẽ kích hoạt lệnh `gitGraph.openGraph`.
    - Tự động cập nhật khi watcher phát hiện HEAD hoặc upstream thay đổi.

#### M13.3 — Phím Tắt Bàn Phím (Keyboard Navigation) [x]
- **Nội dung:**
  - Hỗ trợ thao tác hoàn toàn bằng bàn phím trong CommitList:
    - `Arrow Down` / `Arrow Up`: Chuyển commit được chọn lên/xuống.
    - `Enter`: Mở/Đóng Details Panel của commit đang focus.
    - `Space`: Mở diff của file đầu tiên thay đổi.
    - `Escape`: Đóng Details panel hoặc đóng modal đang mở.
    - `Ctrl+F` / `Cmd+F`: Focus ngay vào thanh tìm kiếm commit.

#### M13.4 — Resizable Columns & Compact Mode [x]
- **Nội dung:**
  - Cho phép người dùng kéo thả đường phân cách giữa các cột để điều chỉnh độ rộng:
    - Cột Graph / Cột Description & Subject / Cột Author / Cột Date / Cột Commit Hash.
    - Lưu lại độ rộng từng cột vào `persistence.ts`.
  - Bổ sung chế độ "Compact View" trong `ViewConfigMenu`:
    - Giảm chiều cao dòng từ 24px xuống 18px để hiển thị nhiều commit hơn trên màn hình nhỏ.

---

### Giai Đoạn 6: Tối Ưu Quy Mô Lớn, Kiểm Thử & Phát Hành Marketplace (Phase 6) — [ĐÃ HOÀN THÀNH]

Mục tiêu: Đảm bảo extension đạt độ ổn định tuyệt đối (Zero Crash, Zero Memory Leak) trên các dự án lớn (Linux kernel, Chromium, Monorepos) và sẵn sàng xuất bản.

#### M14.1 — Stress Testing & Memory Profiling (50,000 - 100,000 commits) — [ĐÃ HOÀN THÀNH]
- **Nội dung:**
  - Chạy benchmark mô phỏng cuộn liên tục (rapid scrolling) qua 100 trang commits.
  - Kiểm tra và đảm bảo:
    - Memory footprint của Webview không vượt quá 120MB (thực tế 23.87MB trong full benchmark).
    - LRU Cache giới hạn nghiêm ngặt: `DETAILS_CACHE_LIMIT = 500`, `DIFF_CACHE_LIMIT = 100`.
    - Garbage collection hoạt động đúng khi chuyển đổi repository liên tục.
  - Xuất báo cáo benchmark cập nhật vào `docs/benchmark-report.json` và `docs/benchmark-report.quick.json`.
  - Bổ sung test tự động: `test/integration/stress-memory.test.ts`.

#### M14.2 — Mở Rộng Test Coverage & Quality Gates — [ĐÃ HOÀN THÀNH]
- **Nội dung:**
  - Bổ sung test suites cho toàn bộ Dialogs mới (CreateTag, Merge, Rebase, Reset, CherryPick, Revert, Stash):
    + `apps/webview/test/features/CherryPickDialog.test.tsx`
    + `apps/webview/test/features/RevertDialog.test.tsx`
    + `apps/webview/test/features/CustomDateRangeDialog.test.tsx`
  - Bổ sung test cho uncommitted changes staging/unstaging/commit workflow:
    + `apps/webview/test/features/UncommittedChangesWorkflow.test.tsx`
  - Bổ sung regression test cho bàn phím và column resizing:
    + `apps/webview/test/features/KeyboardAndColumnResizingRegression.test.tsx`
  - Đảm bảo toàn bộ tiêu chí DoD (`typecheck`, `lint`, `format`, `test`) pass 100%.

#### M14.3 — Đóng Gói VSIX & Chuẩn Bị Release Marketplace — [ĐÃ HOÀN THÀNH]
- **Nội dung:**
  - Tối ưu hóa bundle: Loại bỏ source maps dư thừa trong production bundle (`vite.config.ts`, `bundle-extension.mjs`, `prepare-vsix.mjs`), nén asset icons SVG.
  - Hoàn thiện tài liệu `README.md` với đầy đủ mô tả các tính năng:
    + Virtualized Graph topology view.
    + Working tree staging & committing.
    + Merge, Rebase, Reset workflows.
    + File history & diff comparison.
  - Cập nhật `CHANGELOG.md` chuẩn bị phiên bản `0.2.0` đầy đủ chi tiết các giai đoạn 1 -> 6.
  - Cấu hình GitHub Actions CI/CD tự động đóng gói VSIX artifact và publish release tag: `.github/workflows/release.yml`.

---

## 4. Bảng Kế Hoạch Triển Khai Chi Tiết (Backlog & Thứ Tự Thực Hiện)

| ID | Module / Task | Phụ Thuộc | Độ Ưu Tiên | Ước Lượng | Đầu Ra Bắt Buộc | Trạng Thái |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GG2-01** | `CreateTagDialog` & `DeleteTagDialog` | UI Primitives | P0 | 1 ngày | Form tạo/xóa tag, validate ref name, test coverage | Hoàn thành |
| **GG2-02** | `MergeDialog` & Fast-Forward Mode Picker | GG2-01 | P0 | 1 ngày | Modal merge an toàn, options ff/squash, test | Hoàn thành |
| **GG2-03** | `RebaseDialog` & Published Branch Guard | GG2-02 | P0 | 1.5 ngày | Cảnh báo rebase branch công khai, sequencer link | Hoàn thành |
| **GG2-04** | `ResetDialog` với Safe/Hard Mode Guard | UI Primitives | P0 | 1 ngày | 3 modes reset, cảnh báo đỏ khi hard reset, test | Hoàn thành |
| **GG2-05** | `CherryPickDialog` & `RevertDialog` (Mainline Parent) | UI Primitives | P1 | 1 ngày | Picker chọn parent khi là merge commit | Hoàn thành |
| **GG2-06** | Uncommitted Changes: Staged vs Unstaged List | Shared Protocol | P0 | 1.5 ngày | Hiển thị 2 vùng thay đổi, icon trạng thái file | Hoàn thành |
| **GG2-07** | Stage, Unstage & Discard Actions | GG2-06 | P0 | 1.5 ngày | Các nút +, -, trash và stage/unstage all | Hoàn thành |
| **GG2-08** | Direct Commit Form (Summary, Description, Amend) | GG2-07 | P0 | 1 ngày | Commit form ngay trên webview, tự reload graph | Hoàn thành |
| **GG2-09** | Git Stash Lifecycle (Save, Pop, Apply, Drop) | UI Primitives | P1 | 1.5 ngày | Dialog lưu stash, menu apply/pop/drop, test | Hoàn thành |
| **GG2-10** | Multi-Commit Range Diff UX (Ctrl/Cmd + Click) | DetailsStore | P1 | 1.5 ngày | Chọn 2 commit, header so sánh, diff matrix | Hoàn thành |
| **GG2-11** | Date Range Filter (Preset & Custom Picker) | Toolbar | P1 | 1 ngày | Lọc ngày, query git --after/--before, active filter pill | Hoàn thành |
| **GG2-12** | File Path History Filter ("View History for Path") | CommitQuery | P1 | 1 ngày | `git log -- <path>`, tích hợp Explorer context menu | Hoàn thành |
| **GG2-13** | Sắp xếp Commit Order (--date-order, --topo-order) | CommitQuery | P2 | 0.5 ngày | Tùy chọn cấu hình sắp xếp topo vs date | Hoàn thành |
| **GG2-14** | VS Code Status Bar Item & Deep Navigation | Extension Host | P1 | 1 ngày | Status bar pill hiển thị branch & ahead/behind | Hoàn thành |
| **GG2-15** | Keyboard Navigation & Column Resizing | CommitList | P2 | 1.5 ngày | Di chuyển mũi tên, Enter/Space, kéo chỉnh cột | Hoàn thành |
| **GG2-16** | Stress Benchmark 100K Commits & Release VSIX | Tất cả | P0 | 1.5 ngày | Benchmark không leak memory, đóng gói VSIX | Hoàn thành |

---

## 5. Quy Chuẩn Kỹ Thuật Bắt Buộc (Architecture & Quality Gates)

Để đảm bảo chất lượng mã nguồn luôn duy trì đỉnh cao theo `AGENTS.md`, mọi thay đổi trong các task trên **bắt buộc** tuân thủ:

1. **Ranh giới Phụ thuộc:**
   - Webview không bao giờ import `vscode`.
   - Mọi message phải định nghĩa types và schemas trong `packages/shared/src/protocol/`.
2. **Quy tắc Hiệu năng Zustand:**
   - Luôn dùng single granular selector: `const commits = useGraphStore((s) => s.commits);`.
   - Tuyệt đối cấm destructure toàn bộ store `const { ... } = useStore()`.
3. **Quy tắc Callback & `React.memo`:**
   - Mọi handler truyền vào components ảo hóa/danh sách phải được bọc `useCallback` với dependencies chuẩn xác.
   - Không dùng inline arrow functions trong render path của list/row components.
4. **Tái sử dụng UI Primitives:**
   - Tuyệt đối không tự viết overlay hay phím tắt riêng cho dialog mới: luôn dùng `Modal`, `ModalTitle`, `ModalField`, `ModalActions`.
   - Không dùng SVG inline: đăng ký icon vào `components/ui/icons.tsx` và dùng `<Icon name="..." />`.
5. **Quy trình Definition of Done (DoD):**
   Mỗi task khi hoàn thành phải pass toàn bộ 4 kiểm tra bắt buộc:
   ```sh
   npm run typecheck    # 0 errors
   npm run lint         # 0 warnings/errors
   npm run format       # Prettier check pass
   npm test             # 100% test suites pass
   ```

---

## 6. Tổng Kết Triển Khai & Nghiệm Thu (Implementation & Verification Summary)

Toàn bộ các Sprint và các hạng mục tính năng từ **GG2-01** đến **GG2-16** đã được **hoàn thành và nghiệm thu trọn vẹn 100%**:

1. **Sprint 1 (Tuần 1) — ĐÃ HOÀN THÀNH:** Triển khai **GG2-01**, **GG2-02**, **GG2-03**, **GG2-04** (Bộ 4 Dialogs trọng tâm: `CreateTagDialog`, `MergeDialog`, `RebaseDialog`, `ResetDialog`).
2. **Sprint 2 (Tuần 2) — ĐÃ HOÀN THÀNH:** Triển khai **GG2-06**, **GG2-07**, **GG2-08** (Quản lý Working Tree: Staging, Unstaging, Discard và Direct Commit form trên Webview).
3. **Sprint 3 (Tuần 3) — ĐÃ HOÀN THÀNH:** Triển khai **GG2-09** (Git Stash lifecycle) và **GG2-10** (So sánh Multi-Commit Arbitrary Diff với `Ctrl`/`Cmd` + Click).
4. **Sprint 4 (Tuần 4) — ĐÃ HOÀN THÀNH:** Tích hợp VS Code Ecosystem (**GG2-12**, **GG2-14**), Keyboard Navigation & Resizable Columns (**GG2-15**), và Benchmark Hardening 100K commits / Đóng gói VSIX (**GG2-16**).

> **Kết quả nghiệm thu:** 107 test suites / 923 tests pass 100%, 0 lỗi TypeScript, 0 lỗi Lint, Prettier chuẩn mực, sẵn sàng phát hành Marketplace (Production-Ready). Chi tiết xem tại `DEVELOPMENT_PLAN_VERIFICATION_REPORT.md`.
