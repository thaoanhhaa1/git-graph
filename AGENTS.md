# AGENTS.md — Quy Tắc Dự Án Git Graph

> Nguồn tham chiếu: `PERFORMANCE_AND_REUSE_PLAN.md`, `PERFORMANCE_AND_REUSE_REVIEW.md`.
> Mọi thay đổi phải tuân thủ các quy tắc dưới đây trừ khi có chỉ đạo khác từ người dùng.

## 1. Tổng Quan & Kiến Trúc Monorepo

VS Code extension hiển thị đồ thị Git tương tác. Monorepo npm workspaces:

| Workspace | Vai trò | Stack |
| :--- | :--- | :--- |
| `apps/extension` | Extension host: commands, repositories, watchers, webview panel | TypeScript, VS Code API |
| `apps/webview` | Giao diện đồ thị | React 18, Zustand, Vite |
| `packages/shared` | Domain models + protocol webview↔extension | TypeScript thuần |
| `packages/git-core` | Git CLI client, parsers, queries | TypeScript thuần |
| `packages/git-graph` | Thuật toán layout đồ thị | TypeScript thuần |

Ranh giới phụ thuộc: `apps/*` được phép import `packages/*`; các `packages/*` **không** được import chéo lẫn nhau trừ qua `@git-graph/shared` (hoặc như đã khai báo trong `package.json`). Không import trực tiếp `vscode` từ webview hoặc packages.

### Giao tiếp Webview ↔ Extension

- Mọi message phải định nghĩa type/payload trong `packages/shared/src/protocol/messages.ts` và validate bằng schema tương ứng.
- Webview chỉ gửi/nhận qua `apps/webview/src/messaging/` (`vscodeApi.ts`, `messageRouter.ts`) — không gọi `acquireVsCodeApi` rải rác trong components.
- Store Zustand tại `apps/webview/src/stores/`: `repositoryStore`, `graphStore`, `selectionStore`, `detailsStore`, `diffStore`, `configStore`.

## 2. Lệnh Bắt Buộc

```sh
npm run build                # build toàn bộ workspaces
npm run typecheck            # tsc --noEmit toàn monorepo
npm run lint                 # eslint .
npm run format               # prettier --check .
npm run format:fix           # prettier --write .
npm test                     # vitest run (unit + integration per workspace config)
npm run test:integration     # chỉ integration tests ở test/integration
npm run test:e2e             # E2E cần VS Code host
npm run benchmark:quick      # benchmark layout/serialization (khi sửa hot path)
npm run republish            # build + typecheck + lint + format:fix + test
```

## 3. Quy Trình Verify (Definition of Done)

Trước khi báo hoàn thành bất kỳ task nào, phải chạy và pass:

1. `npm run typecheck` — 0 errors.
2. `npm run lint` — sạch.
3. `npm run format` (hoặc `format:fix`).
4. `npm test` — toàn bộ test suites pass.

Nếu thay đổi ảnh hưởng render/layout/scrolling/search của webview, chạy thêm `npm run benchmark:quick` và ghi nhận kết quả. Không bao giờ commit, amend, push hay tạo PR trừ khi người dùng yêu cầu rõ ràng.

## 4. Quy Tắc Hiệu Năng (Bắt Buộc)

Đây là các pattern đã được kiểm chứng, **không được làm mất hoặc viết code mới xung đột**:

### 4.1. Zustand — Granular Selectors

- Luôn dùng selector đơn lẻ: `const commits = useGraphStore((s) => s.commits);`
- **Cấm** destructuring toàn bộ store (`const { a, b } = useStore()`) trong mọi component — gây cascade re-render khi state không liên quan thay đổi.

### 4.2. Callback Ổn Định & `React.memo`

- Mọi handler truyền xuống `CommitList`/`CommitRow`/`CommitMetadata` phải bọc `useCallback` với dependency chính xác.
- **Cấm** inline arrow function trong props của component đã `React.memo` (kể cả các props như `onSelect={(c) => ...}`).
- Dùng hằng số module-level `const NOOP = () => {};` cho props mặc định thay vì `() => {}` inline.
- Khi thêm component list/row mới, bọc `React.memo` + viết test tương tự `CommitRowMemo.test.tsx`.

### 4.3. Tra Cứu O(1) — Cấm Quét Mảng Trong Render Path

- **Cấm** `commits.findIndex(...)` / `commits.find(...)` trong render hoặc scroll effect. Xây `Map<string, number>` (`byHash`, `byShortHash`) memo hóa theo mảng `commits`.
- Tính `maxGraphLane` qua `useMaxGraphLane` — chỉ duyệt phần tử mới (prefix check), không quét lại toàn bộ.

### 4.4. Tính Toán Tăng Dần (Incremental)

- Chuẩn hóa dữ liệu dẫn xuất trong `useCommitRows`: lazy date formatting (`date: ''` khi normalize, format lúc render trong `CommitRow`), WeakMap cache giữ nguyên object reference của commit cũ khi phân trang.
- Khi tải trang mới, chỉ xử lý phần tail mới: kiểm tra prefix rồi gọi `buildCommitGraph(tail, { continuation, startRow, totalPageRows })` với `GraphContinuation` từ page trước, dọn cờ boundary tại ranh giới.
- Tiền tính các trường search (`subjectLower`, `authorLower`, `hashLower`, `shortHashLower`, `refsLower`) một lần; `matchesCommit` chỉ gọi `includes(query)` switch theo `SearchType`. **Cấm** `.toLowerCase()` trong vòng lặp search hoặc trên mỗi keystroke.

### 4.5. Scroll

- Duy trì cơ chế row-band quantization: `Math.floor(currentScrollTop / rowHeight)`; chỉ dispatch `setScrollTop` khi vượt ranh giới dòng, đồng thời cập nhật spacer top/bottom đúng.
- Giữ `GraphContinuation` là component riêng, không đưa IIFE/khối SVG continuation trở lại trong `CommitList`.

### 4.6. Cache Giới Hạn & Lazy

- Cache store phải có trần LRU: `DETAILS_CACHE_LIMIT = 500`, `DIFF_CACHE_LIMIT = 100` (xem `detailsStore.ts`, `diffStore.ts`).
- Dùng helper `withCacheEntry` với in-place mutation Map (không tạo Map mới mỗi message), luôn `delete` trước `set` để đảm bảo thứ tự LRU.
- Không dùng `useMemo`/`useEffect` để tính derived data lớn nếu có thể tính tăng dần hoặc lazy.

## 5. Quy Tắc Tái Sử Dụng (Bắt Buộc)

**Trước khi viết UI mới, kiểm tra catalog bên dưới và tái sử dụng:**

### 5.1. UI Primitives — `apps/webview/src/components/ui/`

| Component | Dùng cho |
| :--- | :--- |
| `Button` | variant: primary, secondary, icon, none |
| `TextInput` | input text (forwarded ref) |
| `Checkbox`, `CheckboxField` | checkbox + nhãn + testid |
| `RadioGroup` | nhóm radio có state |
| `Select`, `SelectControl`, `SelectField` | dropdown (chuẩn HTML / styled / label wrapper) |
| `Modal`, `ModalTitle`, `ModalField`, `ModalActions` | mọi dialog — tự động xử lý Escape/Enter/click ngoài, `role="dialog"`, `aria-modal` |
| `Icon` | mọi icon SVG |
| `Toast` | thông báo loading/error/info/success |

- **Cấm** tự viết lại overlay/keyboard handling cho dialog mới — luôn dùng họ `Modal`.
- **Cấm** thêm SVG inline vào component. Thêm icon mới bằng cách khai báo trong `components/ui/icons.tsx` (đăng ký `ICONS`) rồi dùng `<Icon name="..." />`.
- Dialog tại `features/dialogs/*` chỉ chứa form input + business logic, không chứa HTML overlay.

### 5.2. Hooks Dùng Chung — `apps/webview/src/hooks/`

| Hook | Dùng cho |
| :--- | :--- |
| `useCommitRows` | chuẩn hóa commit lazy, search matching, incremental graph layout |
| `useMaxGraphLane` | max lane O(new rows) |
| `useDistinctOptions` | danh sách unique từ generator/iterable (author/branch selector) |
| `useToast` | quản lý toast + timer tự hủy (luôn cleanup khi unmount) |

- **Cấm** viết lại logic `Set<string>` + sort cho dropdown; dùng `useDistinctOptions`.
- **Cấm** tự quản lý `setTimeout` cho toast ngoài `useToast`.

### 5.3. Menu

- Context menu dùng `MenuItemRow` và `MenuSeparator` từ `features/menu/Menu.tsx`; giữ accessibility (`role="menuitem"`, `aria-selected`, `aria-disabled`).

## 6. Bất Biến & Tương Thích (Không Được Phá Vỡ)

- **Không đổi/xóa** `data-testid` hiện có — nhiều test E2E/unit phụ thuộc.
- **Không đổi** tên CSS class hiện hành (ví dụ `create-branch-modal-overlay`, `toolbar-control-wrapper`, `select-control`); style mới thêm vào file CSS tương ứng.
- Giữ ARIA roles/labels cho modal, menu, list.
- Thay đổi protocol message phải cập nhật đồng thời: `packages/shared/src/protocol` (types + schemas), handler extension (`apps/extension/src/webview`), router webview (`apps/webview/src/messaging`).

## 7. Quy Ước Testing

- Vị trí: `apps/webview/test/**` (mirror cấu trúc `src/`), `apps/extension/test/**`, `packages/*/test/**`, `test/integration/**`.
- Đặt tên: `*.unit.test.ts` / `*.integration.test.ts` (packages, git-core), `*.test.tsx` (webview components), `*.test.ts` (stores, extension).
- Mỗi component/hook mới cần ít nhất: render test, hành vi chính, và regression test cho memoization/O(1) nếu là list/row hot path.
- Test phải chạy trong môi trường happy-dom cho webview; mock vscode API qua `apps/extension/test/__mocks__/vscode.ts` khi cần.
- Không xóa hoặc skip test để làm xanh CI; sửa nguyên nhân gốc.

## 8. Quy Ước Git / Commit

- Commit message theo Conventional Commits, mô tả ngắn gọn bằng tiếng Anh: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:` (tham khảo lịch sử gần nhất).
- Chỉ stage các file thuộc phạm vi task; không commit file build (`dist/`, `apps/webview/dist/`) hay artifact benchmark tạm.
- **Không** commit/amend/push/tạo PR khi chưa được yêu cầu. Không force-push, không sửa git config, không bỏ qua hooks.
