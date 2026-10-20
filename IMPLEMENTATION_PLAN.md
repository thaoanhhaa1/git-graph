# Kế hoạch hiện thực Git Graph Extension

> Tài liệu nguồn: `spec.md`  
> Ngày lập kế hoạch: 2026-09-18  
> Trạng thái repository hiện tại: chưa có mã nguồn, chỉ có đặc tả  
> Mục tiêu: xây dựng VS Code extension hiển thị Git commit graph, ưu tiên MVP ổn định trước khi bổ sung các thao tác Git có rủi ro cao.

## 1. Mục tiêu sản phẩm

Xây dựng một VS Code extension có khả năng:

- Phát hiện và quản lý một hoặc nhiều Git repository trong workspace.
- Đọc lịch sử commit, branch cục bộ, remote branch và tag bằng Git CLI.
- Tính topology graph độc lập với VS Code và React.
- Hiển thị commit graph trong Webview bằng React, SVG và virtualized list.
- Tìm kiếm, lọc, xem chi tiết commit, danh sách file thay đổi và diff.
- Thực hiện các thao tác an toàn trong MVP: refresh, checkout branch/ref, tạo branch và tạo tag.
- Mở rộng sau MVP với merge, rebase, cherry-pick, revert và reset có kiểm soát.
- Hoạt động tốt trên repository lớn thông qua phân trang, cache và incremental loading.

## 2. Nguyên tắc kiến trúc

### 2.1. Phân lớp bắt buộc

```text
Git CLI
  ↓
Git Core / Repository Engine
  ↓
Commit Graph Engine
  ↓
Extension Application Layer
  ↓ postMessage
Webview State + React UI
```

Các quy tắc:

1. Webview không được gọi Git trực tiếp.
2. Graph Engine không phụ thuộc `vscode`, React, DOM hoặc filesystem.
3. Extension Host là nơi duy nhất được phép truy cập workspace, filesystem và chạy process.
4. Mọi message Extension ↔ Webview phải có type rõ ràng, version và validation runtime.
5. Các thao tác làm thay đổi repository phải đi qua một operation service tập trung.
6. Các thao tác phá huỷ hoặc có thể làm mất dữ liệu phải có preflight check và confirmation.
7. Không tải toàn bộ lịch sử của repository lớn trong một lần.

### 2.2. Stack đề xuất

| Khu vực | Công nghệ | Lý do |
| --- | --- | --- |
| Extension Host | TypeScript + VS Code Extension API | Tích hợp trực tiếp với VS Code |
| Git integration | Git CLI qua `child_process.spawn` | Tương thích hành vi Git thực tế |
| Webview | React + TypeScript | Component hóa và quản lý UI phức tạp |
| Bundler | Vite | Build Webview nhanh, hỗ trợ asset tốt |
| State | Zustand | Store nhỏ, ít boilerplate |
| Graph MVP | SVG | Dễ phát triển, debug và test |
| Virtualization | `@tanstack/react-virtual` | Chỉ render các commit đang thấy |
| Validation | Zod | Xác thực message và dữ liệu biên |
| Unit test | Vitest | Phù hợp TypeScript/Vite |
| E2E extension | `@vscode/test-electron` | Chạy extension trong VS Code thật |
| Packaging | `@vscode/vsce` | Đóng gói VSIX và phát hành Marketplace |

### 2.3. Monorepo đề xuất

Sử dụng npm workspaces để giảm độ phức tạp ban đầu.

```text
git-graph/
├── apps/
│   ├── extension/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   ├── application/
│   │   │   ├── git/
│   │   │   ├── repositories/
│   │   │   ├── operations/
│   │   │   ├── watchers/
│   │   │   ├── webview/
│   │   │   ├── logging/
│   │   │   ├── configuration/
│   │   │   └── extension.ts
│   │   └── test/
│   └── webview/
│       ├── src/
│       │   ├── components/
│       │   ├── features/
│       │   ├── hooks/
│       │   ├── stores/
│       │   ├── styles/
│       │   ├── messaging/
│       │   └── main.tsx
│       └── test/
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── domain/
│   │       ├── protocol/
│   │       └── errors/
│   ├── git-core/
│   │   └── src/
│   │       ├── client/
│   │       ├── parsers/
│   │       ├── queries/
│   │       └── repository/
│   └── git-graph/
│       └── src/
│           ├── algorithm/
│           ├── model/
│           └── fixtures/
├── test/
│   ├── fixtures/
│   ├── integration/
│   └── e2e/
├── scripts/
├── package.json
├── tsconfig.base.json
├── eslint.config.js
└── vitest.workspace.ts
```

## 3. Phạm vi phát hành

### 3.1. MVP — phiên bản `0.1.0`

Bao gồm:

- Mở Git Graph từ Command Palette và Source Control title/menu.
- Chọn repository khi workspace có nhiều repository.
- Hiển thị commit graph có branch, remote branch và tag.
- Incremental loading theo trang.
- Refresh tự động khi refs hoặc HEAD thay đổi.
- Search theo commit message, author, SHA, branch và tag.
- Lọc branch cơ bản.
- Xem commit metadata, parent, file changed, stats và diff.
- Copy SHA, copy commit message.
- Checkout branch/ref với kiểm tra working tree.
- Tạo branch và tạo tag.
- Dark/light/high-contrast theme.
- Logging, error state, empty state và cancellation.

Không thuộc MVP:

- Merge, rebase, cherry-pick, revert, reset.
- Stash management.
- Interactive rebase.
- Push/pull/fetch UI nâng cao.
- Canvas renderer.
- Git submodule graph.
- Git worktree management.

### 3.2. Post-MVP — phiên bản `0.2.x`

- Merge vào branch hiện tại.
- Rebase branch hiện tại lên ref được chọn.
- Cherry-pick và revert commit.
- Reset soft/mixed/hard; hard reset bắt buộc confirmation chi tiết.
- Conflict state và các lệnh continue/abort/skip.
- Fetch/pull/push.
- Cache nâng cao và background refresh.

### 3.3. Scale release — phiên bản `0.3.x`

- Tối ưu repository 100K–500K commits.
- Đánh giá/chuyển graph renderer từ SVG sang Canvas khi benchmark chứng minh cần thiết.
- Search phía Git cho tập dữ liệu chưa được tải vào Webview.
- Persist cache theo repository fingerprint.

## 4. Mô hình domain và protocol

### 4.1. Các type cốt lõi

```ts
type RepositoryId = string;
type CommitSha = string;

interface RepositoryDescriptor {
    id: RepositoryId;
    rootPath: string;
    name: string;
    gitDir: string;
    isBare: boolean;
}

interface Commit {
    sha: CommitSha;
    shortSha: string;
    parents: CommitSha[];
    author: GitIdentity;
    committer: GitIdentity;
    subject: string;
    body?: string;
    refs: GitRef[];
}

interface GitIdentity {
    name: string;
    email: string;
    timestamp: number;
    timezone: string;
}

interface GitRef {
    name: string;
    fullName: string;
    target: CommitSha;
    kind: 'head' | 'localBranch' | 'remoteBranch' | 'tag';
    isCurrent?: boolean;
}

interface CommitPage {
    commits: Commit[];
    cursor?: string;
    hasMore: boolean;
}
```

### 4.2. Graph output

```ts
interface GraphRow {
    commit: Commit;
    row: number;
    lane: number;
    segments: GraphSegment[];
    maxLane: number;
}

interface GraphSegment {
    fromRow: number;
    fromLane: number;
    toRow: number;
    toLane: number;
    kind: 'straight' | 'branch' | 'merge' | 'pass-through';
    colorIndex: number;
}
```

Graph Engine phải trả đủ segment cho từng row; UI chỉ chuyển tọa độ lane/row thành SVG path.

### 4.3. Message envelope

```ts
interface MessageEnvelope<TType extends string, TPayload> {
    protocolVersion: 1;
    id: string;
    type: TType;
    payload: TPayload;
}
```

Nhóm message Webview → Extension:

- `app.ready`
- `repositories.list.request`
- `repository.select`
- `commits.page.request`
- `commit.details.request`
- `commit.diff.request`
- `search.request`
- `graph.refresh.request`
- `operation.checkout.request`
- `operation.branch.create.request`
- `operation.tag.create.request`
- `operation.cancel.request`

Nhóm message Extension → Webview:

- `app.bootstrap`
- `repositories.list.result`
- `repository.changed`
- `commits.page.result`
- `commit.details.result`
- `commit.diff.result`
- `graph.invalidated`
- `operation.progress`
- `operation.result`
- `notification.error`

Yêu cầu protocol:

- Mỗi request có `id`; response phải giữ `requestId` để chống race condition.
- Validate cả hai phía bằng schema dùng chung.
- Không gửi path filesystem không cần thiết vào Webview.
- Có cancellation token cho request Git dài.
- Có `protocolVersion` để hỗ trợ migration.

## 5. Kế hoạch triển khai theo milestone

## Milestone 0 — Bootstrap và technical spike

**Mục tiêu:** tạo workspace có thể build, debug và trao đổi message giữa Extension Host với Webview.

### M0.1 — Khởi tạo workspace

File dự kiến:

- `package.json`
- `package-lock.json`
- `tsconfig.base.json`
- `eslint.config.js`
- `.prettierrc.json`
- `.gitignore`
- `vitest.workspace.ts`
- `.vscode/launch.json`
- `.vscode/tasks.json`

Công việc:

- Khai báo npm workspaces cho `apps/*` và `packages/*`.
- Thêm script thống nhất: `build`, `watch`, `test`, `test:unit`, `test:integration`, `test:e2e`, `lint`, `typecheck`, `package`.
- Bật TypeScript strict mode, `noUncheckedIndexedAccess` và source map.
- Cấu hình build độc lập cho extension và webview.
- Chốt Node engine và VS Code engine trong extension manifest.

Nghiệm thu:

- `npm install` hoàn tất.
- `npm run build`, `npm run typecheck` và `npm run test:unit` chạy được trên skeleton.
- F5 mở Extension Development Host không lỗi.

### M0.2 — Extension skeleton

File dự kiến:

- `apps/extension/package.json`
- `apps/extension/src/extension.ts`
- `apps/extension/src/commands/registerCommands.ts`
- `apps/extension/src/webview/GitGraphPanel.ts`
- `apps/extension/src/webview/getWebviewHtml.ts`

Công việc:

- Khai báo command `gitGraph.openGraph` và activation event tương ứng.
- Tạo/reveal một Webview panel duy nhất cho mỗi VS Code window.
- Thiết lập CSP nghiêm ngặt, nonce cho script, `localResourceRoots` tối thiểu.
- Dispose listener đúng vòng đời extension/panel.
- Hiển thị skeleton loading khi Webview chưa bootstrap.

Nghiệm thu:

- Command mở được panel.
- Reload panel không tạo listener trùng.
- Không có lỗi CSP trong Developer Tools.

### M0.3 — React Webview skeleton

File dự kiến:

- `apps/webview/index.html`
- `apps/webview/vite.config.ts`
- `apps/webview/src/main.tsx`
- `apps/webview/src/App.tsx`
- `apps/webview/src/styles/theme.css`
- `apps/webview/src/messaging/vscodeApi.ts`

Công việc:

- Khởi tạo React root.
- Dùng CSS variables của VS Code cho màu, font, focus ring.
- Tạo adapter cho `acquireVsCodeApi()` để dễ mock trong test.
- Gửi `app.ready` sau khi mount.
- Nhận `app.bootstrap` và render repository placeholder.

Nghiệm thu:

- Extension và Webview gửi/nhận message hai chiều.
- UI theo đúng light, dark và high-contrast theme.

### M0.4 — Shared protocol

File dự kiến:

- `packages/shared/src/protocol/messages.ts`
- `packages/shared/src/protocol/schemas.ts`
- `packages/shared/src/domain/*.ts`
- `packages/shared/src/errors/AppError.ts`

Công việc:

- Định nghĩa message union và payload.
- Tạo Zod schema và helper parse an toàn.
- Chuẩn hóa error code: `GIT_NOT_FOUND`, `NOT_A_REPOSITORY`, `DIRTY_WORKTREE`, `GIT_COMMAND_FAILED`, `INVALID_MESSAGE`, `OPERATION_CANCELLED`.

Nghiệm thu:

- Message sai schema bị từ chối và được log, không làm crash extension/webview.
- Protocol package không phụ thuộc VS Code hoặc React.

## Milestone 1 — Git Core và Repository Engine

**Mục tiêu:** chuyển dữ liệu Git thành model TypeScript ổn định, có test parser và integration test với repository tạm.

### M1.1 — Git executable và process runner

File dự kiến:

- `packages/git-core/src/client/GitClient.ts`
- `packages/git-core/src/client/GitCliClient.ts`
- `packages/git-core/src/client/GitResult.ts`
- `packages/git-core/src/client/GitCommandError.ts`

Công việc:

- Phát hiện Git executable và đọc `git --version`.
- Chạy lệnh bằng `spawn`, truyền argument array; không nối command string.
- Hỗ trợ `cwd`, environment, stdin, timeout, max output và `AbortSignal`.
- Thu stdout/stderr theo Buffer để không làm hỏng output lớn hoặc Unicode.
- Chuẩn hóa exit code, signal, duration và command metadata đã loại dữ liệu nhạy cảm.
- Không dùng shell mặc định để tránh command injection.

Nghiệm thu:

- Chạy được lệnh thành công, lệnh lỗi, timeout và cancellation.
- Argument chứa khoảng trắng/ký tự đặc biệt không làm thay đổi command.
- Unit test không cần Git thật bằng fake process adapter; integration test dùng Git thật.

### M1.2 — Repository discovery

File dự kiến:

- `apps/extension/src/repositories/RepositoryManager.ts`
- `packages/git-core/src/repository/RepositoryLocator.ts`

Công việc:

- Duyệt các workspace folder.
- Xác định root bằng `git rev-parse --show-toplevel`.
- Xác định git dir bằng `git rev-parse --git-dir`.
- Deduplicate nested workspace cùng trỏ về một repository.
- Nhận diện bare repository, detached HEAD và repository không hợp lệ.
- Chuẩn bị interface để sau này hỗ trợ nested repository/submodule.

Nghiệm thu:

- Trả đúng danh sách repository cho workspace đơn, multi-root và non-Git.
- UI có empty state khi không tìm thấy repository.

### M1.3 — Commit query và parser

File dự kiến:

- `packages/git-core/src/queries/CommitQuery.ts`
- `packages/git-core/src/repository/GitRepository.ts`
- `packages/git-core/src/parsers/CommitLogParser.ts`

Công việc:

- Dùng `git log --all --date-order` với custom pretty format.
- Dùng record separator và field separator là control characters để tránh lỗi do subject/body chứa ký tự thông thường.
- Lấy SHA, parent SHA, author/committer name-email-time-timezone, subject và decoration cần thiết.
- Tách query metadata nhẹ và query commit body nặng; không tải body/diff cho toàn bộ list.
- Hỗ trợ `limit`, cursor/skip, ref filter, author, date range và text query.
- Cursor MVP có thể dựa trên page number/skip; ghi rõ hạn chế nếu history thay đổi giữa hai page.

Nghiệm thu:

- Parser xử lý commit merge, root commit, Unicode, multiline body và email trống.
- Có fixture test cho malformed/truncated output.

### M1.4 — Branch, remote branch và tag

File dự kiến:

- `packages/git-core/src/parsers/RefParser.ts`
- `packages/git-core/src/queries/RefQuery.ts`

Công việc:

- Dùng `git for-each-ref` với format xác định trước.
- Đọc local branch, remote branch, upstream, HEAD state và target SHA.
- Đọc lightweight/annotated tag và peeled target.
- Loại symbolic remote HEAD khỏi danh sách branch tương tác.
- Chuẩn hóa full ref name và display name.

Nghiệm thu:

- Phân biệt đúng local, remote, current branch, annotated tag và lightweight tag.
- Detached HEAD vẫn hiển thị graph và HEAD ref.

### M1.5 — Commit details và diff

File dự kiến:

- `packages/git-core/src/queries/CommitDetailsQuery.ts`
- `packages/git-core/src/queries/DiffQuery.ts`
- `packages/git-core/src/parsers/DiffStatParser.ts`

Công việc:

- Lấy full metadata cho một commit theo yêu cầu.
- Lấy file status, rename/copy, additions/deletions.
- Lấy diff theo commit-parent hoặc empty tree cho root commit.
- Với merge commit, cho phép chọn parent để compare.
- Áp giới hạn kích thước diff và trả trạng thái truncated.
- Nhận diện binary file thay vì cố render text diff.

Nghiệm thu:

- Commit thường, root commit, merge commit, rename và binary file có kết quả đúng.
- Diff quá lớn không làm treo Extension Host.

### M1.6 — Repository watcher và invalidation

File dự kiến:

- `apps/extension/src/watchers/RepositoryWatcher.ts`
- `apps/extension/src/application/RefreshCoordinator.ts`

Công việc:

- Theo dõi `HEAD`, `refs`, `packed-refs`, `logs/HEAD` và các state file merge/rebase khi có thể.
- Debounce event filesystem.
- Có fallback refresh khi VS Code window lấy lại focus hoặc người dùng bấm refresh.
- Chỉ phát `graph.invalidated`; không tự động chạy nhiều Git query trùng nhau.
- Dùng generation ID để bỏ kết quả cũ khi repository thay đổi giữa lúc query.

Nghiệm thu:

- Commit/checkout từ terminal làm graph refresh trong thời gian mục tiêu.
- Một thay đổi Git không gây refresh loop hoặc hàng chục query lặp.

## Milestone 2 — Commit Graph Engine

**Mục tiêu:** xây graph topology bằng hàm thuần, deterministic và có test bao phủ các topology khó.

### M2.1 — Graph model và invariant

File dự kiến:

- `packages/git-graph/src/model/GraphRow.ts`
- `packages/git-graph/src/model/GraphSegment.ts`
- `packages/git-graph/src/model/LaneState.ts`

Invariant cần chốt:

- Mỗi commit có đúng một row và một node lane.
- Lane index không âm và liên tục trong phạm vi row.
- Parent edge kết thúc tại commit parent nếu parent có trong tập dữ liệu.
- Edge ra ngoài page được đánh dấu boundary để nối với page sau.
- Cùng input và option phải cho cùng output và màu lane.
- Graph Engine không mutate `Commit[]` đầu vào.

### M2.2 — Lane allocation algorithm

File dự kiến:

- `packages/git-graph/src/algorithm/buildCommitGraph.ts`
- `packages/git-graph/src/algorithm/LaneAllocator.ts`

Thuật toán theo từng row:

1. Tìm commit hiện tại trong active lanes; nếu chưa có thì cấp lane mới.
2. Chụp trạng thái lane trước khi thay đổi để tạo pass-through segment.
3. Xoá token của commit hiện tại khỏi lane.
4. Đặt first parent vào lane hiện tại khi có thể để giữ mainline thẳng.
5. Chèn các parent còn lại vào lane trống/gần nhất theo quy tắc deterministic.
6. Nếu parent đã tồn tại ở lane khác, tạo merge segment thay vì tạo token trùng.
7. Compact lane chỉ khi không làm edge đang hoạt động đổi nghĩa.
8. Xuất node, segments, active lane state và continuation state.

Quyết định MVP:

- Input phải theo `--date-order` để parent xuất hiện sau child trong lịch sử hiển thị.
- Parent đầu tiên được coi là first-parent/mainline của commit.
- Màu gắn theo lane lineage, không đơn thuần theo lane index tức thời.

### M2.3 — Edge và page continuation

File dự kiến:

- `packages/git-graph/src/algorithm/buildSegments.ts`
- `packages/git-graph/src/model/GraphContinuation.ts`

Công việc:

- Sinh `straight`, `branch`, `merge`, `pass-through` segment.
- Trả state ở cuối page để page tiếp theo tiếp tục lane mà không nhảy graph.
- Xử lý parent chưa có trong page hiện tại.
- Xử lý refs trỏ tới commit ngoài page.
- Chuẩn hóa color index để UI chỉ map sang palette.

### M2.4 — Bộ test topology bắt buộc (Đã hoàn thành)

File thực hiện:

- `packages/git-graph/test/mandatoryTopologies.test.ts`: Bộ 12 fixtures bắt buộc kèm snapshot testing và assert invariant độc lập.
- `packages/git-graph/test/__snapshots__/mandatoryTopologies.test.ts.snap`: 13 snapshots định dạng rõ ràng, dễ review.
- `packages/git-graph/test/propertyBased.unit.test.ts`: Property-based test trên 40 random DAG topology và multi-page slice.
- `packages/git-graph/test/milestone2Acceptance.unit.test.ts`: Nghiệm thu Milestone 2 (pure function, zero dependencies, benchmark 10K commits).

Fixtures đã hiện thực:

- [x] Linear history.
- [x] Một branch chưa merge.
- [x] Fast-forward history.
- [x] Two-parent merge.
- [x] Criss-cross/multiple merge cơ bản.
- [x] Nhiều branch đồng thời.
- [x] Octopus merge.
- [x] Root commit.
- [x] Detached HEAD.
- [x] Commit có parent ngoài page.
- [x] Hai page nối tiếp nhau.
- [x] Nhiều ref cùng trỏ vào một commit.

Kiểu assert:

- [x] Snapshot graph rows để dễ review (`formatGraphSnapshot` + Vitest snapshots).
- [x] Assert invariant độc lập với snapshot (`assertGraphInvariants`, `assertDeterministicOutput`).
- [x] Property-based test: không lane âm, không duplicate node, edge endpoint hợp lệ trên 40 topologies ngẫu nhiên.

Nghiệm thu Milestone 2 (Đạt 100%):

- [x] `buildCommitGraph(commits, continuation?)` là pure function (deterministic, immutable inputs).
- [x] 100% test topology bắt buộc pass (79/79 tests trong `@git-graph/git-graph`, 301/301 tests toàn monorepo).
- [x] Không có dependency tới `vscode`, React, DOM hoặc Git CLI (kiểm tra tự động dependencies và source AST/imports).
- [x] Benchmark 10K commit synthetic nằm trong ngân sách hiệu năng đã đặt (< 300ms, thực tế ~30ms).


## Milestone 3 — Graph Webview MVP

**Mục tiêu:** render graph chính xác, dễ đọc và không render toàn bộ DOM.

### M3.1 — Store và data flow

File dự kiến:

- `apps/webview/src/stores/repositoryStore.ts`
- `apps/webview/src/stores/graphStore.ts`
- `apps/webview/src/stores/selectionStore.ts`
- `apps/webview/src/messaging/messageRouter.ts`

Công việc:

- [x] Store repository list, active repository, loaded pages, selection và request state.
- [x] Deduplicate commit theo SHA khi ghép page.
- [x] Bỏ response cũ dựa trên request ID/generation.
- [x] Tách server state khỏi transient UI state.
- [x] Lưu state cần thiết bằng `vscode.setState()` để Webview restore nhanh.

### M3.2 — Layout và toolbar

File dự kiến:

- `apps/webview/src/features/graph/GitGraphView.tsx`
- `apps/webview/src/features/toolbar/Toolbar.tsx`
- `apps/webview/src/features/repository/RepositorySelector.tsx`
- `apps/webview/src/features/search/SearchInput.tsx`

Công việc:

- [x] Repository selector.
- [x] Branch filter.
- [x] Search input có debounce.
- [x] Refresh button và loading indicator.
- [x] Empty/error/retry states.
- [x] Keyboard focus order và ARIA label.

### M3.3 — Virtualized commit list

File dự kiến:

- `apps/webview/src/features/graph/CommitList.tsx`
- `apps/webview/src/features/graph/CommitRow.tsx`

Công việc:

- [x] Dùng fixed row height ở MVP để graph line đồng bộ và dễ tối ưu.
- [x] Render overscan vừa đủ để scroll mượt.
- [x] Trigger tải page tiếp theo gần cuối viewport.
- [x] Giữ scroll position khi append page hoặc refresh hợp lệ.
- [x] Không key theo row index; dùng SHA cộng context repository.

### M3.4 — SVG graph renderer

File dự kiến:

- `apps/webview/src/features/graph/GraphCell.tsx`
- `apps/webview/src/features/graph/GraphNode.tsx`
- `apps/webview/src/features/graph/GraphPath.tsx`
- `apps/webview/src/features/graph/graphGeometry.ts`

Công việc:

- [x] Chuyển lane/row thành tọa độ SVG.
- [x] Vẽ segment bằng path, node bằng circle.
- [x] Dùng palette có độ tương phản tốt trên dark/light/high contrast.
- [x] Không render text trong SVG; metadata nằm ở DOM để accessibility tốt hơn.
- [x] Cho phép graph cell mở rộng ngang khi có nhiều lane.
- [x] Test geometry bằng hàm thuần và visual fixture.

### M3.5 — Commit metadata và refs

File dự kiến:

- `apps/webview/src/features/graph/CommitMetadata.tsx`
- `apps/webview/src/features/refs/RefBadge.tsx`

Công việc:

- [x] Hiển thị short SHA, subject, author, date.
- [x] Badge khác nhau cho HEAD, local branch, remote branch, tag.
- [x] Ellipsis với tooltip/title phù hợp.
- [x] Relative date cập nhật có kiểm soát; không tạo timer cho từng row.
- [x] Cho phép cấu hình ẩn/hiện author, date, remote branch và tag.

### M3.6 — Theme và accessibility

Công việc:

- [x] Dùng VS Code theme variables, không hard-code background chính.
- [x] Hỗ trợ keyboard chọn row, Enter mở detail, context-menu key mở action menu.
- [x] Selection state nhìn rõ ở high contrast.
- [x] Tôn trọng reduced motion.
- [x] Screen reader đọc commit summary mà không phải đọc toàn bộ SVG path.

Nghiệm thu Milestone 3:

- [x] Graph linear/branch/merge khớp fixture của Graph Engine.
- [x] Scroll 10K rows không tạo 10K DOM nodes.
- [x] Theme và keyboard navigation hoạt động.
- [x] Tải page tiếp theo không làm graph nối sai lane.

## Milestone 4 — Commit interaction và read-only features

**Mục tiêu:** hoàn thiện trải nghiệm xem, tìm kiếm, lọc và so sánh commit trước khi thêm thao tác ghi.

### M4.1 — Selection và details panel

File dự kiến:

- `apps/webview/src/features/details/CommitDetailsPanel.tsx`
- `apps/extension/src/application/CommitDetailsController.ts`

Công việc:

- [x] Click/keyboard chọn commit.
- [x] Hiển thị SHA, subject/body, author, committer, date, parent, ref.
- [x] Hiển thị loading riêng cho details, không block graph.
- [x] Cache details theo repository + SHA.
- [x] Cho phép chọn parent đối với merge commit.

### M4.2 — Changed files và diff

File dự kiến:

- `apps/webview/src/features/details/ChangedFiles.tsx`
- `apps/webview/src/features/diff/DiffViewer.tsx`

Công việc:

- [x] Hiển thị file status, additions/deletions, rename.
- [x] Chỉ tải diff khi người dùng chọn file.
- [x] Render unified diff an toàn bằng text, không inject HTML từ Git output.
- [x] Có truncated state, binary state và nút mở diff bằng VS Code command khi phù hợp.

### M4.3 — Search và filter

Công việc:

- [x] Search loaded commits ngay trên Webview để phản hồi nhanh.
- [x] Khi query cần phạm vi toàn repository, gửi query xuống Git Core.
- [x] Search theo subject, author, SHA, branch và tag.
- [x] Branch filter xác định refs/revision range cần query, không chỉ ẩn row tùy tiện làm graph đứt.
- [x] Date/author filter có thể triển khai sau branch filter nhưng giữ API query từ đầu.
- [x] Hiển thị active filter và nút clear all.

### M4.4 — Read-only context actions

Actions:

- [x] View Commit.
- [x] View Changes.
- [x] Compare with Parent.
- [x] Copy SHA.
- [x] Copy Commit Message.

Nghiệm thu Milestone 4:

- [x] Người dùng có thể tìm commit, mở details và xem diff mà không rời Git Graph.
- [x] Search/filter không hiển thị graph sai topology.
- [x] Diff lớn, binary và merge commit có UX rõ ràng.

## Milestone 5 — Safe Git operations cho MVP

**Mục tiêu:** thêm thao tác ghi ít rủi ro với quy trình preflight, progress, cancellation và refresh thống nhất.

### M5.1 — Operation framework

File dự kiến:

- [x] `apps/extension/src/operations/GitOperationService.ts`
- [x] `apps/extension/src/operations/OperationQueue.ts`
- [x] `apps/extension/src/operations/OperationPreflight.ts`
- [x] `apps/extension/src/operations/OperationResult.ts`

Công việc:

- [x] Mỗi repository chỉ chạy một mutating operation tại một thời điểm.
- [x] Preflight kiểm tra repository tồn tại, working tree state, detached HEAD và ref validity.
- [x] Gửi progress/result có operation ID.
- [x] Log command metadata nhưng không log credential/token.
- [x] Sau thành công: invalidate repository cache và refresh refs/graph.
- [x] Sau thất bại: giữ stderr đã sanitize, map sang thông báo có thể hành động.

### M5.2 — Checkout

Công việc:

- [x] Checkout local branch.
- [x] Checkout tag/commit vào detached HEAD với cảnh báo rõ.
- [x] Checkout remote branch bằng cách tạo tracking branch khi người dùng xác nhận tên.
- [x] Nếu working tree dirty, không tự động stash; hiển thị lựa chọn/instruction an toàn.
- [x] Chống ref option injection bằng `--` hoặc validate ref theo context lệnh.

### M5.3 — Create branch

Công việc:

- [x] Nhận branch name và start point.
- [x] Validate bằng `git check-ref-format --branch`.
- [x] Kiểm tra branch đã tồn tại.
- [x] Cho phép tạo rồi checkout hoặc chỉ tạo.

### M5.4 — Create tag

Công việc:

- [x] Tạo lightweight tag trong MVP.
- [x] Chuẩn bị model để hỗ trợ annotated tag/message ở post-MVP.
- [x] Validate tag name và duplicate.

Nghiệm thu Milestone 5:

- [x] Checkout/create branch/create tag chạy được từ context menu.
- [x] Dirty worktree không bị ghi đè hoặc tự stash ngoài ý muốn.
- [x] UI refresh đúng sau operation.
- [x] Operation lỗi không làm store/Webview rơi vào loading vô hạn.

## Milestone 6 — Performance, cache và resilience

**Mục tiêu:** đạt trải nghiệm ổn định trên repository thực tế và có số đo cụ thể.

### M6.1 — Repository cache

File dự kiến:

- `apps/extension/src/application/RepositoryCache.ts`
- `apps/extension/src/application/CacheInvalidation.ts`

Cache:

- Repository metadata.
- Refs snapshot.
- Commit pages.
- Graph continuation state.
- Commit details.
- Diff metadata ngắn hạn.

Invalidation trigger:

- HEAD/ref thay đổi.
- Commit/fetch/pull/merge/rebase từ bên ngoài.
- Operation do extension thực hiện.
- Repository switch.
- Configuration ảnh hưởng query thay đổi.

### M6.2 — Incremental loading và backpressure

Công việc:

- [x] Mặc định page size 500, cấu hình được trong giới hạn an toàn.
- [x] Không cho nhiều request page kế tiếp cùng lúc.
- [x] Cancel query cũ khi đổi repository/filter.
- [x] Không gửi payload vượt ngưỡng định trước; chia chunk nếu cần.
- [x] Đo serialization/deserialization time cho message lớn.

### M6.3 — Benchmark

Tập benchmark:

- [x] Synthetic: 1K, 10K, 50K, 100K và 500K commits (`npm run benchmark`).
- [x] Topology: linear, nhiều branch, nhiều merge.
- [x] Repository thật có tag, remote branch và rename khi workspace Git có dữ liệu tương ứng.
- [x] Benchmark report JSON được sinh ra tại `docs/benchmark-report.json`.

Ngân sách ban đầu:

| Chỉ số | Mục tiêu MVP |
| --- | --- |
| Mở panel tới skeleton | < 300 ms |
| Trang 500 commit đầu tiên | < 2 giây trên repo cục bộ thông thường |
| Graph calculation 10K commits | < 300 ms trong benchmark Node mục tiêu |
| Scroll Webview | gần 60 FPS trên máy phát triển chuẩn |
| DOM commit rows | viewport + overscan, không phụ thuộc tổng số commit |
| Refresh refs không đổi | không rebuild toàn bộ graph không cần thiết |

Các số liệu phải được đo và điều chỉnh theo CI/máy chuẩn; không coi là đảm bảo tuyệt đối trước khi benchmark.

### M6.4 — Resilience

Công việc:

- [x] Timeout Git command hợp lý theo loại query.
- [x] Cancellation khi panel dispose hoặc repository switch.
- [x] Giới hạn stdout/stderr để tránh memory pressure.
- [x] Error boundary phía React.
- [x] Recover khi Webview reload mà không restart extension.
- [x] Không crash khi repository bị xoá hoặc `.git` thay đổi giữa query.

## Milestone 7 — Testing, packaging và release MVP

### M7.1 — Unit tests

Bắt buộc:

- [x] Git process runner.
- [x] Commit/ref/diff parser.
- [x] Message schema/router.
- [x] Graph lane/edge algorithm.
- [x] Graph geometry.
- [x] Store reducer và stale response handling.
- [x] Validation cho branch/tag/ref.

### M7.2 — Integration tests

Tạo repository tạm bằng script/test helper:

- [x] `git init` và cấu hình local user.
- [x] Tạo linear commits.
- [x] Tạo branch và merge.
- [x] Tạo annotated/lightweight tag.
- [x] Tạo rename và binary file.
- [x] Tạo dirty worktree.
- [x] Assert repository service, parser, graph và operation.

Mỗi test phải:

- [x] Dùng thư mục tạm riêng.
- [x] Không phụ thuộc global Git config ngoài executable.
- [x] Cleanup sau khi chạy.
- [x] Không gọi network.

### M7.3 — Extension E2E

Scenarios:

- [x] Mở workspace Git và chạy `Git Graph: Open Graph`.
- [x] Graph hiển thị commit fixture.
- [x] Chọn commit và mở details.
- [x] Search theo SHA/subject.
- [x] Checkout branch sạch.
- [x] Dirty worktree hiển thị cảnh báo.
- [x] Tạo branch và thấy ref mới sau refresh.
- [x] Workspace không phải Git hiển thị empty state.

### M7.4 — Release engineering

File dự kiến:

- `CHANGELOG.md`
- `README.md`
- `LICENSE` nếu dự án chọn license.
- `.vscodeignore`
- icon và marketplace assets.
- CI workflow cho lint/typecheck/test/build/package.

Công việc:

- Hoàn thiện extension manifest: commands, menus, configuration, categories, keywords.
- Kiểm tra bundle không chứa source/test/dependency thừa.
- Chạy `vsce package` và cài VSIX vào VS Code sạch.
- Kiểm tra Windows, macOS và Linux trong CI hoặc matrix thủ công phù hợp.
- Viết privacy/security note: extension chạy Git cục bộ, không tự gửi dữ liệu repository ra ngoài.

Nghiệm thu release `0.1.0`:

- Toàn bộ quality gate pass.
- VSIX cài được và smoke test thành công.
- README mô tả feature, giới hạn, cấu hình và troubleshooting.
- Không còn lỗi P0/P1 đã biết.

## Milestone 8 — Post-MVP Git operations

Chỉ bắt đầu khi Graph Engine, watcher, cache và operation framework ổn định.

### M8.1 — Merge

- Preflight dirty state và current branch.
- Hỗ trợ `--no-ff`/fast-forward policy qua lựa chọn rõ ràng.
- Phát hiện conflict và hiển thị trạng thái đang merge.
- Cung cấp abort; không tự resolve conflict.

### M8.2 — Rebase

- Rebase current branch onto ref.
- Hiển thị cảnh báo khi branch đã publish/upstream.
- Hỗ trợ continue/abort/skip khi Git ở rebase state.
- Chưa làm interactive rebase trong giai đoạn này.

### M8.3 — Cherry-pick và revert

- Hỗ trợ một commit trước, nhiều commit sau.
- Phát hiện merge commit cần mainline parent.
- Conflict flow dùng chung operation state machine.

### M8.4 — Reset

- Soft, mixed, hard.
- Hard reset dùng modal confirmation nêu rõ target SHA và nguy cơ mất thay đổi.
- Không đặt hard reset là action mặc định hoặc action một click.

## 6. Trình tự dependency

```text
M0 Bootstrap
 ├── M1 Git Core
 │    ├── M2 Graph Engine
 │    │    └── M3 Graph Webview
 │    └── M4 Details / Diff / Search
 ├── M3 Graph Webview
 └── M5 Safe Operations

M1 + M2 + M3 + M4 + M5
 └── M6 Performance / Resilience
      └── M7 Release MVP
           └── M8 Post-MVP Operations
```

Critical path:

1. Bootstrap và protocol.
2. Commit/ref parser.
3. Lane/edge algorithm và tests.
4. Virtualized graph renderer.
5. Details/diff.
6. Safe operations.
7. Performance và release hardening.

Không bắt đầu merge/rebase/reset trước khi operation framework và conflict-state detection hoàn tất.

## 7. Backlog theo thứ tự thực hiện

| ID | Task | Phụ thuộc | Ước lượng | Kết quả |
| --- | --- | --- | --- | --- |
| GG-001 | Khởi tạo npm workspace và TypeScript config | — | 0.5 ngày | Workspace build được |
| GG-002 | Extension command và Webview panel skeleton | GG-001 | 1 ngày | Mở panel bằng command |
| GG-003 | React/Vite skeleton và theme | GG-001 | 1 ngày | Webview render được |
| GG-004 | Shared domain/protocol/schema | GG-001 | 1 ngày | Message typed + validated |
| GG-005 | Git process runner | GG-001 | 1.5 ngày | Chạy Git an toàn, cancel được |
| GG-006 | Repository discovery/manager | GG-005 | 1 ngày | Multi-root repository list |
| GG-007 | Commit query/parser | GG-005 | 2 ngày | `CommitPage` có test |
| GG-008 | Ref query/parser | GG-005 | 1.5 ngày | Branch/tag/HEAD model |
| GG-009 | Details/diff query | GG-005, GG-007 | 2 ngày | Commit details + changed files |
| GG-010 | Repository watcher | GG-006 | 1.5 ngày | Invalidation có debounce |
| GG-011 | Graph model/invariants | GG-004, GG-007 | 0.5 ngày | Contract Graph Engine |
| GG-012 | Lane allocator | GG-011 | 2.5 ngày | Node lane deterministic |
| GG-013 | Edge/segment builder | GG-012 | 2 ngày | Branch/merge lines |
| GG-014 | Graph continuation qua pages | GG-013 | 1.5 ngày | Graph phân trang không đứt |
| GG-015 | Graph fixture/snapshot/invariant tests | GG-012, GG-013 | 2 ngày | Topology suite pass |
| GG-016 | Webview stores/message router | GG-003, GG-004 | 1.5 ngày | Data flow ổn định |
| GG-017 | Toolbar/repository selector/states | GG-006, GG-016 | 1.5 ngày | Chọn repo, refresh |
| GG-018 | Virtualized commit list | GG-016 | 2 ngày | List tải theo viewport |
| GG-019 | SVG graph renderer | GG-013, GG-018 | 2.5 ngày | Graph hiển thị đúng |
| GG-020 | Commit metadata/ref badges/theme | GG-008, GG-018 | 1.5 ngày | Row hoàn chỉnh |
| GG-021 | Commit details panel | GG-009, GG-016 | 1.5 ngày | Xem metadata |
| GG-022 | Changed files/diff viewer | GG-009, GG-021 | 2 ngày | Xem diff an toàn |
| GG-023 | Search/filter | GG-007, GG-008, GG-016 | 2 ngày | Search/filter đúng topology |
| GG-024 | Read-only context menu | GG-021, GG-022 | 1 ngày | Copy/view/compare |
| GG-025 | Operation framework/preflight/queue | GG-005, GG-010 | 2 ngày | Nền tảng mutation |
| GG-026 | Checkout | GG-025 | 1.5 ngày | Checkout an toàn |
| GG-027 | Create branch | GG-025 | 1 ngày | Tạo branch hợp lệ |
| GG-028 | Create tag | GG-025 | 1 ngày | Tạo lightweight tag |
| GG-029 | Cache/invalidation | GG-010, GG-014 | 2 ngày | Query không lặp thừa |
| GG-030 | Performance benchmark/tuning | GG-019, GG-029 | 2.5 ngày | Báo cáo benchmark |
| GG-031 | Unit/integration coverage hardening | GG-009, GG-015, GG-028 | 2 ngày | Quality gate pass |
| GG-032 | VS Code E2E suite | GG-020, GG-028 | 2 ngày | E2E critical path |
| GG-033 | README/configuration/logging/errors | GG-020, GG-025 | 1.5 ngày | Production UX |
| GG-034 | Package VSIX và release checklist | GG-030, GG-031, GG-032, GG-033 | 1 ngày | Candidate `0.1.0` |

Tổng ước lượng MVP: khoảng 43–50 ngày công cho một lập trình viên, bao gồm test và hardening. Có thể rút xuống 7–9 tuần nếu scope được giữ chặt, sử dụng thư viện phù hợp và một số đầu việc độc lập được thực hiện song song.

## 8. Kế hoạch theo sprint đề xuất

### Sprint 1 — Nền tảng

- GG-001 → GG-006.
- Kết quả demo: mở panel, handshake, liệt kê repository.

### Sprint 2 — Dữ liệu Git

- GG-007 → GG-010.
- Kết quả demo: trả JSON commit/ref/details từ repository thật.

### Sprint 3 — Graph Engine

- GG-011 → GG-015.
- Kết quả demo: sinh graph JSON và snapshot cho mọi topology bắt buộc.

### Sprint 4 — Graph UI

- GG-016 → GG-020.
- Kết quả demo: graph ảo hóa, refs, theme, incremental loading.

### Sprint 5 — Read-only UX

- GG-021 → GG-024.
- Kết quả demo: search, details, changed files và diff.

### Sprint 6 — Safe operations

- GG-025 → GG-028.
- Kết quả demo: checkout/create branch/create tag có preflight.

### Sprint 7 — Scale và release

- GG-029 → GG-034.
- Kết quả demo: benchmark report, E2E, VSIX release candidate.

## 9. Quality gates

Một pull request chỉ được merge khi:

- TypeScript typecheck pass.
- ESLint/format pass.
- Unit test liên quan pass.
- Có test mới cho parser, graph algorithm hoặc bug fix logic.
- Không thêm dependency vào layer thấp hơn trái với kiến trúc.
- Không chạy Git command bằng shell string.
- Message mới có schema runtime và backward-compatible trong protocol version hiện tại.
- UI mới có loading, empty, error và keyboard state phù hợp.
- Mutation mới có preflight, result mapping, logging và cache invalidation.

Gate trước release:

- Build production pass.
- Unit + integration + E2E critical path pass.
- VSIX smoke test trên VS Code sạch.
- Không có lỗi P0/P1.
- Benchmark không regression quá ngưỡng đã thống nhất.
- Security review cho command arguments, Webview CSP và diff rendering.

## 10. Chiến lược test chi tiết

### 10.1. Test pyramid

```text
Nhiều unit tests
  ├── parser
  ├── graph algorithm
  ├── protocol
  ├── store
  └── geometry

Vừa đủ integration tests
  ├── Git CLI ↔ temp repository
  ├── repository service
  └── operations

Ít nhưng quan trọng E2E tests
  └── VS Code ↔ Extension ↔ Webview ↔ Git
```

### 10.2. Graph golden fixtures

Mỗi fixture nên gồm:

- Danh sách commit theo đúng order đầu vào.
- Parent mapping.
- Refs.
- Expected row/lane.
- Expected segments.
- ASCII diagram giải thích để reviewer đọc nhanh.

Khi snapshot thay đổi, reviewer phải xác nhận bằng diagram; không cập nhật snapshot tự động mà không hiểu topology.

### 10.3. Cross-platform concerns

- Path Windows và drive letter.
- CRLF trong output/diff.
- Git executable path có khoảng trắng.
- Unicode branch/tag/author/subject.
- Case sensitivity khác nhau theo filesystem.
- Symlink và workspace folder nested.
- Shell không được dùng làm dependency cho Git runner.

## 11. Logging, telemetry và privacy

### Logging

- Dùng `vscode.window.createOutputChannel('Git Graph')`.
- Mức log: error, warn, info, debug.
- Log repository bằng display name hoặc hashed path khi cần; tránh lộ path trong report ngoài ý muốn.
- Log command name, duration, exit code; không log credential, remote URL có token hoặc toàn bộ diff.
- Có setting bật debug logging.

### Telemetry

- MVP không cần telemetry.
- Nếu bổ sung sau này, phải opt-in/tuân theo VS Code telemetry setting và không thu commit content, file path hoặc remote URL.

### Webview security

- CSP với nonce; không dùng `unsafe-inline` cho script.
- Không tải script từ CDN.
- Escape/render Git content như text.
- Validate mọi message từ Webview.
- Không tin branch name, commit message hoặc diff content dù chúng đến từ local repository.

## 12. Configuration dự kiến

```json
{
    "gitGraph.maxCommits": 1000,
    "gitGraph.pageSize": 500,
    "gitGraph.showRemoteBranches": true,
    "gitGraph.showTags": true,
    "gitGraph.showAuthor": true,
    "gitGraph.showDate": true,
    "gitGraph.dateFormat": "relative",
    "gitGraph.autoRefresh": true,
    "gitGraph.confirmDestructiveOperations": true,
    "gitGraph.logLevel": "info"
}
```

Validation:

- `pageSize` có min/max để tránh payload quá lớn.
- `maxCommits` phải lớn hơn hoặc bằng `pageSize`.
- Thay đổi setting render-only không query lại Git nếu không cần.
- Thay đổi setting query-related phải invalidate đúng cache.

## 13. Error handling matrix

| Tình huống | Hành vi |
| --- | --- |
| Git chưa cài | Hiển thị hướng dẫn cấu hình Git path/cài Git |
| Không phải repository | Empty state và chọn folder khác |
| Detached HEAD | Vẫn render; cảnh báo trước thao tác cần branch |
| Dirty working tree | Chặn/cảnh báo checkout hoặc operation rủi ro |
| Merge/rebase conflict | Hiển thị operation state; không giả định thất bại thông thường |
| Ref không hợp lệ | Validate trước khi chạy Git |
| Permission denied | Hiển thị path/action liên quan, log stderr đã sanitize |
| Repository bị xoá | Dispose watcher/cache và yêu cầu chọn lại repository |
| Git command timeout | Cancel process, cho retry |
| Diff quá lớn | Hiển thị truncated state hoặc mở bằng công cụ ngoài |
| Message không hợp lệ | Bỏ message, log warning, không crash |
| Webview reload | Bootstrap lại từ Extension state/cache |

## 14. Rủi ro và biện pháp giảm thiểu

### R1 — Lane algorithm sai ở history phức tạp

- Giảm thiểu: pure function, golden fixtures, invariant tests, page-boundary tests.
- Không ghép logic topology vào React renderer.

### R2 — Git output parser dễ vỡ

- Giảm thiểu: custom separators, `for-each-ref`, fixture chứa Unicode/multiline/malformed output.
- Không parse output dành cho người đọc mặc định của Git.

### R3 — Repository lớn làm treo Extension Host/Webview

- Giảm thiểu: pagination, virtualization, cancellation, payload limit, benchmark từ sớm.

### R4 — Watcher tạo refresh storm

- Giảm thiểu: debounce, coalescing, generation ID và single-flight query.

### R5 — Git operation làm mất dữ liệu

- Giảm thiểu: scope MVP chỉ có operation an toàn hơn, preflight dirty state, confirmation và không auto-stash.
- Reset hard/rebase/merge chỉ vào post-MVP.

### R6 — Message race khi đổi repository/filter nhanh

- Giảm thiểu: request ID, repository ID, generation ID và cancellation.

### R7 — SVG không đủ nhanh ở topology rộng

- Giảm thiểu: chỉ render viewport, benchmark lane width; chuyển Canvas chỉ khi có dữ liệu chứng minh.

### R8 — Cross-platform behavior khác nhau

- Giảm thiểu: không dùng shell, CI matrix, temp repository integration tests.

## 15. Definition of Done cho MVP

MVP được coi là hoàn thành khi:

- Extension cài được từ VSIX và kích hoạt đúng.
- Graph hiển thị đúng cho linear, branch, merge, multiple merge và octopus merge fixtures.
- Repository có ít nhất 10K commit vẫn có thể mở, scroll và tải thêm mà không render toàn bộ DOM.
- Branch, remote branch, tag và HEAD được phân biệt rõ.
- Search, branch filter, commit details, changed files và diff hoạt động.
- Checkout, create branch và create tag có preflight và refresh đúng.
- Watcher nhận thay đổi từ terminal mà không gây refresh storm.
- Unit, integration và E2E critical path pass.
- Webview đạt yêu cầu CSP, message validation và safe text rendering.
- README, settings, logging, troubleshooting và changelog đã hoàn chỉnh.
- Không còn lỗi severity P0/P1; lỗi P2 còn lại phải được ghi rõ trong release notes/backlog.

## 16. Bước triển khai đầu tiên

Thứ tự bắt đầu được khuyến nghị:

1. Thực hiện GG-001 đến GG-004 để có workspace, panel, Webview và protocol.
2. Viết Git process runner cùng integration test repository tạm trước khi viết parser.
3. Hoàn thành commit/ref parser và đóng băng domain contract tối thiểu.
4. Xây Graph Engine bằng fixtures, chưa làm UI graph cho đến khi topology tests pass.
5. Sau khi graph output ổn định, làm virtualized list và SVG renderer.
6. Chỉ thêm operation ghi sau khi read-only flow và watcher ổn định.

Checkpoint kỹ thuật đầu tiên nên là một vertical slice nhỏ:

```text
Open Git Graph command
  → detect active repository
  → load 100 commits
  → build graph rows
  → send typed message
  → render virtualized SVG graph
```

Vertical slice này chưa cần details, diff hoặc mutation nhưng phải đi xuyên qua toàn bộ kiến trúc. Nó giúp xác nhận sớm rằng build pipeline, protocol, Git parser, Graph Engine và Webview tích hợp đúng trước khi mở rộng tính năng.
