Nếu mục tiêu là **tự hiện thực một Git Graph extension** kiểu Git Graph trong VS Code — hiển thị commit graph, branch/tag, diff, checkout, merge/rebase… — mình đề xuất chia thành **8 phase**, ưu tiên làm **MVP trước**, sau đó mới mở rộng Git operations.

## Tổng quan roadmap

```text
Phase 0
  ↓
Architecture & Technical Spike
  ↓
Phase 1
  ↓
Git Core / Repository Engine
  ↓
Phase 2
  ↓
Commit Graph Engine
  ↓
Phase 3
  ↓
Graph UI
  ↓
Phase 4
  ↓
Commit / Branch Interaction
  ↓
Phase 5
  ↓
Git Operations
  ↓
Phase 6
  ↓
Performance & UX
  ↓
Phase 7
  ↓
Testing / Packaging / Release
```

### Phạm vi mục tiêu

| Phase | Nội dung       | Kết quả                    |
| ----- | -------------- | -------------------------- |
| 0     | Architecture   | Kiến trúc extension        |
| 1     | Git Engine     | Đọc repository             |
| 2     | Graph Engine   | Tính topology commit       |
| 3     | Graph UI       | Hiển thị Git graph         |
| 4     | Interaction    | Click, filter, search      |
| 5     | Git Operations | Checkout, branch, merge... |
| 6     | Performance    | Repo lớn, virtualization   |
| 7     | Test & Release | Extension production       |

---

# Phase 0 — Architecture & Technical Spike

**Mục tiêu:** xác định kiến trúc trước khi code UI.

### 0.1. Chọn stack

Mình đề xuất:

```text
VS Code Extension
├── TypeScript
├── VS Code Extension API
├── Git CLI
├── React
├── Webview
├── Vite
└── Zustand / Context
```

Kiến trúc:

```text
┌───────────────────────────────┐
│         VS Code UI            │
│                               │
│  Git Graph Webview             │
│       React + TypeScript      │
└───────────────┬───────────────┘
                │ postMessage
                ▼
┌───────────────────────────────┐
│      Extension Host            │
│                               │
│ GitRepositoryService           │
│ GitGraphService                │
│ GitOperationService            │
│ RepositoryWatcher              │
└───────────────┬───────────────┘
                │
                ▼
             Git CLI
```

### 0.2. Repository structure

```text
git-graph-extension/
│
├── apps/
│   ├── extension/
│   │   └── src/
│   │       ├── extension.ts
│   │       ├── commands/
│   │       ├── providers/
│   │       ├── services/
│   │       ├── git/
│   │       └── webview/
│   │
│   └── webview/
│       └── src/
│           ├── components/
│           ├── features/
│           ├── hooks/
│           ├── stores/
│           └── types/
│
├── packages/
│   ├── git-core/
│   ├── git-graph/
│   └── shared/
│
├── tests/
│
├── package.json
├── tsconfig.json
└── README.md
```

### 0.3. Xác định communication protocol

Extension ↔ Webview:

```ts
type ExtensionMessage =
    | {
          type: 'commits.loaded';
          payload: CommitGraph;
      }
    | {
          type: 'repository.changed';
      }
    | {
          type: 'operation.result';
          payload: OperationResult;
      };

type WebviewMessage =
    | {
          type: 'load.commits';
          payload: LoadCommitsRequest;
      }
    | {
          type: 'checkout';
          payload: {
              ref: string;
          };
      }
    | {
          type: 'create.branch';
          payload: {
              name: string;
              startPoint: string;
          };
      };
```

### Deliverable

Cuối Phase 0 phải có:

- [ ] Architecture diagram
- [ ] Repository structure
- [ ] TypeScript config
- [ ] Extension skeleton
- [ ] React Webview skeleton
- [ ] Extension ↔ Webview messaging
- [ ] Development/debug workflow

---

# Phase 1 — Git Core / Repository Engine

Đây là phase rất quan trọng.

Không nên để React gọi Git trực tiếp.

## 1.1. Git command abstraction

Tạo:

```ts
interface GitClient {
    execute(args: string[], options?: GitExecuteOptions): Promise<GitResult>;
}
```

Implementation:

```ts
class GitCliClient implements GitClient {
    async execute(args: string[]) {
        // child_process.spawn
    }
}
```

---

## 1.2. Repository service

```ts
interface RepositoryService {
    getRoot(): Promise<string>;

    getCurrentBranch(): Promise<string>;

    getBranches(): Promise<Branch[]>;

    getTags(): Promise<Tag[]>;

    getCommits(options: CommitQuery): Promise<Commit[]>;

    getCommit(sha: string): Promise<CommitDetail>;
}
```

---

## 1.3. Parse Git data

Không nên parse output kiểu:

```bash
git log
```

một cách phụ thuộc formatting.

Có thể sử dụng:

```bash
git log --format=...
```

hoặc tốt hơn:

```bash
git log \
  --all \
  --date-order \
  --pretty=format:<custom-format>
```

Thông tin cần lấy:

```ts
interface Commit {
    sha: string;
    shortSha: string;

    parents: string[];

    author: {
        name: string;
        email: string;
        date: number;
    };

    committer: {
        name: string;
        email: string;
        date: number;
    };

    subject: string;

    refs: GitRef[];
}
```

---

## 1.4. Branch

```ts
interface Branch {
    name: string;

    sha: string;

    type: 'local' | 'remote';

    upstream?: string;

    isCurrent: boolean;
}
```

---

## 1.5. Tag

```ts
interface Tag {
    name: string;

    sha: string;

    type: 'lightweight' | 'annotated';
}
```

---

## 1.6. Repository watcher

Theo dõi:

```text
.git/HEAD
.git/refs/
.git/packed-refs
.git/logs/
```

hoặc đơn giản MVP:

```text
poll git status / git rev-parse
```

Sau đó nâng cấp filesystem watcher.

### Deliverable

Có thể chạy:

```text
Open Repository
      ↓
Detect Git
      ↓
Read branches
      ↓
Read tags
      ↓
Read commits
      ↓
Return structured JSON
```

---

# Phase 2 — Commit Graph Engine

Đây là **core khó nhất** của Git Graph.

UI chỉ nên render kết quả của Graph Engine.

## 2.1. Data model

```ts
interface GraphCommit {
    commit: Commit;

    row: number;

    lane: number;

    parents: GraphParent[];

    refs: GitRef[];
}
```

---

# 2.2. Lane algorithm

Ví dụ:

```text
A
|
B
|\
| C
| |
D |
 \|
  E
```

Cần biến thành:

```text
Commit    Lane
A         0
B         0
C         1
D         0
E         0
```

Nhưng lane không đơn giản chỉ là index.

Cần track:

```ts
interface LaneState {
    commitSha: string;

    laneIndex: number;
}
```

Mỗi commit:

```text
current lanes
       ↓
find commit
       ↓
remove current commit
       ↓
insert parents
       ↓
calculate lane transitions
       ↓
next row
```

---

# 2.3. Edge model

Không nên để UI tự suy luận connection.

Graph engine trả:

```ts
interface GraphEdge {
    from: {
        row: number;
        lane: number;
    };

    to: {
        row: number;
        lane: number;
    };

    type: 'straight' | 'merge' | 'branch';
}
```

Ví dụ:

```text
      ●
      │
      ●────●
      │    │
      ●    ●
       \  /
        ●
```

---

# 2.4. Graph algorithm tests

Đây phải là test ưu tiên cao.

Test:

### Linear

```text
A
|
B
|
C
```

### Branch

```text
A
|
B──C
   |
   D
```

### Merge

```text
A──B────E
    \  /
     C
```

### Multiple branches

```text
        C
       /
A──B──D──F
    \   /
     E─
```

### Octopus merge

```text
A──B───F
   ├C──┤
   ├D──┤
   └E──┘
```

### Deliverable

Một function thuần:

```ts
const graph = buildCommitGraph(commits);
```

và:

```text
Input:
Commit[]

Output:
GraphCommit[]
```

**Không phụ thuộc VS Code / React.**

---

# Phase 3 — Graph UI

Sau khi Graph Engine ổn định mới làm UI.

## 3.1. Layout

```text
┌──────────────────────────────────────────────────────┐
│ Repository: project                     Refresh      │
├──────────────────────────────────────────────────────┤
│ ● main                                               │
│ │                                                    │
│ ● 9e5abc9  Add authentication              John      │
│ │                                                    │
│ ● d21a168  Fix API                              2h   │
│ │╲                                                   │
│ │ ● 81abcde  Feature X                              │
│ │ │                                                 │
│ ●─┘ 32abcd1  Merge feature                          │
│ │                                                    │
└──────────────────────────────────────────────────────┘
```

---

## 3.2. Components

```text
GitGraph
├── Toolbar
│   ├── RepositorySelector
│   ├── BranchSelector
│   ├── Search
│   └── Refresh
│
├── CommitList
│   └── CommitRow
│       ├── GraphCanvas
│       ├── CommitHash
│       ├── CommitMessage
│       ├── Author
│       ├── Date
│       └── Refs
│
└── ContextMenu
```

---

# 3.3. Graph rendering

Có 3 lựa chọn:

### Option A — SVG

```text
SVG
 ├── path
 ├── circle
 └── text
```

Ưu điểm:

- dễ code
- dễ debug
- dễ animate

Mình khuyên dùng cho MVP.

### Option B — Canvas

Tốt hơn khi:

```text
10,000+
```

commit.

### Option C — DOM

Không nên dùng cho graph line.

---

## 3.4. Virtualization

Commit list có thể:

```text
100,000 commits
```

Không được render toàn bộ DOM.

Dùng:

```text
Virtualized List
       +
Graph renderer
```

Ví dụ:

```text
Visible rows
     ↓
calculate graph
     ↓
render only viewport
```

---

# Phase 4 — Commit Interaction

Sau khi graph render được mới thêm interaction.

## 4.1. Commit click

Click:

```text
● abc123 Fix login
```

mở:

```text
┌──────────────────────────────┐
│ abc123                        │
│ Fix login issue               │
├──────────────────────────────┤
│ Author                        │
│ Date                          │
│ Parents                       │
│ Children                      │
│ Branches                      │
└──────────────────────────────┘
```

---

## 4.2. Commit actions

Context menu:

```text
View Commit
View Changes
Compare with Parent
Copy SHA
Copy Commit Message
Checkout
Create Branch
Create Tag
Reset
Cherry-pick
Revert
```

---

## 4.3. Branch actions

Click branch:

```text
main
```

menu:

```text
Checkout
Create Branch
Rename
Delete
Merge into Current
Rebase onto
Push
Pull
```

---

# Phase 5 — Git Operations

Đây là phase bắt đầu có nhiều side effects.

## 5.1. Checkout

```bash
git checkout <branch>
```

Flow:

```text
UI
 ↓
Extension
 ↓
validate
 ↓
git checkout
 ↓
refresh repository
 ↓
refresh graph
```

---

## 5.2. Create branch

```bash
git branch <name> <start-point>
```

---

## 5.3. Delete branch

```bash
git branch -d <name>
```

Force:

```bash
git branch -D <name>
```

Phải có confirmation.

---

## 5.4. Merge

```bash
git merge <branch>
```

UI:

```text
Merge branch "feature/login" into "main"?
```

---

## 5.5. Rebase

```bash
git rebase <branch>
```

Đặc biệt phải xử lý:

```text
conflict
abort
continue
skip
```

---

## 5.6. Cherry-pick

```bash
git cherry-pick <sha>
```

Conflict handling:

```text
Cherry-pick failed
│
├── Resolve conflicts
├── Continue
├── Abort
└── Skip
```

---

## 5.7. Reset

```text
Soft
Mixed
Hard
```

Không nên expose `--hard` mà không confirmation.

---

# Phase 6 — Search / Filter / Advanced UX

## 6.1. Search commit

Search:

```text
login
```

tìm:

```text
commit message
author
SHA
branch
tag
```

---

## 6.2. Filter

```text
Branches
☑ main
☑ develop
☐ feature/a
☐ feature/b
```

---

## 6.3. Date filter

```text
Today
Last 7 days
Last 30 days
Custom
```

---

## 6.4. Author filter

```text
John
Alice
Bob
```

---

## 6.5. Commit details

Có thể thêm:

```text
Files changed
+
Diff
+
Stats
```

Ví dụ:

```text
abc123 Fix authentication

12 files changed
+342
-87

src/auth/login.ts
src/auth/token.ts
...
```

---

# Phase 7 — Performance

Đây nên là một phase riêng vì Git Graph rất dễ chậm.

## Target

Test các repo:

```text
1K commits
10K commits
50K commits
100K commits
500K commits
```

---

## 7.1. Git performance

Không nên:

```text
git log
git branch
git tag
git status
```

cho mỗi UI action.

Cache:

```text
RepositoryCache
├── commits
├── branches
├── tags
└── metadata
```

---

## 7.2. Incremental loading

Thay vì:

```text
500,000 commits
       ↓
load all
```

dùng:

```text
Load 500
   ↓
scroll
   ↓
Load next 500
```

---

## 7.3. Graph calculation

Có thể cache:

```ts
Map<CommitSHA, GraphNode>;
```

và invalidate khi:

```text
HEAD changed
branch changed
new commit
fetch
pull
merge
rebase
```

---

## 7.4. Webview performance

Không gửi:

```text
500MB JSON
```

từ Extension → Webview.

Thay vào đó:

```text
Extension
   │
   ├── commit chunk 1
   ├── commit chunk 2
   └── commit chunk 3
```

---

# Phase 8 — Testing

## Unit test

### Git parser

```text
git log parser
branch parser
tag parser
diff parser
```

### Graph

Quan trọng nhất:

```text
linear
branch
merge
multiple branch
multiple merge
octopus merge
```

---

## Integration test

Test:

```text
Extension
 ↓
Git CLI
 ↓
Repository
```

Tạo temporary repository:

```bash
git init
git commit
git branch
git merge
```

Sau đó assert graph.

---

## E2E

Ví dụ:

```text
Open VS Code
 ↓
Open repository
 ↓
Open Git Graph
 ↓
Click commit
 ↓
View details
 ↓
Checkout branch
 ↓
Graph refresh
```

---

# Phase 9 — Production & Release

## 9.1. Error handling

Phải handle:

```text
Not Git repository
Git not installed
Detached HEAD
Merge conflict
Rebase conflict
Invalid branch
Dirty working tree
Permission denied
Repository corrupted
```

---

## 9.2. Logging

Extension:

```ts
const logger = vscode.window.createOutputChannel('Git Graph');
```

Log:

```text
[GitGraph] Repository detected
[GitGraph] Loading commits
[GitGraph] Graph calculated: 10,235 commits
[GitGraph] Render completed
```

---

## 9.3. Configuration

Ví dụ:

```json
{
    "gitGraph.maxCommits": 1000,
    "gitGraph.showRemoteBranches": true,
    "gitGraph.showTags": true,
    "gitGraph.showAuthor": true,
    "gitGraph.showDate": true,
    "gitGraph.dateFormat": "relative"
}
```

---

# Thứ tự implement thực tế

Nếu bạn muốn **code nhanh nhưng architecture không bị nát**, mình sẽ chia task như sau:

```text
WEEK 1
────────────────────────
Phase 0
├── Extension setup
├── React Webview
├── Vite
├── Message protocol
└── Architecture

Phase 1
├── Git CLI
├── Repository detection
├── branch
├── tag
└── commit parser


WEEK 2
────────────────────────
Phase 2
├── Commit graph model
├── Lane algorithm
├── Edge algorithm
├── Merge handling
└── Unit tests


WEEK 3
────────────────────────
Phase 3
├── GitGraph layout
├── CommitRow
├── SVG graph
├── Branch/tag refs
├── Dark/light theme
└── Virtual list


WEEK 4
────────────────────────
Phase 4
├── Commit click
├── Commit detail
├── Context menu
├── Search
├── Filter
└── Diff


WEEK 5
────────────────────────
Phase 5
├── Checkout
├── Branch
├── Tag
├── Merge
├── Rebase
├── Cherry-pick
└── Reset


WEEK 6
────────────────────────
Phase 6
├── Performance
├── Cache
├── Incremental loading
├── Large repository
└── UX polish


WEEK 7
────────────────────────
Phase 7
├── Unit test
├── Integration test
├── E2E
├── Error handling
├── Packaging
└── Release
```

---

# MVP nên dừng ở đâu?

Mình **không khuyên** ngay từ đầu làm toàn bộ Git operations.

MVP nên là:

```text
┌─────────────────────────────────────────────┐
│ Git Graph                                   │
├─────────────────────────────────────────────┤
│ 🔍 Search                    [Refresh]      │
├─────────────────────────────────────────────┤
│                                             │
│ ●── main                                    │
│ │                                           │
│ ● 9e5abc9  feat: authentication    2h       │
│ │╲                                          │
│ │ ● d21a168  feat: login          5h       │
│ │ │                                         │
│ ●─┘ 81abcde  merge login           1d       │
│ │                                           │
│ ● 32abcd1  initial commit          2d       │
│                                             │
└─────────────────────────────────────────────┘
```

Có:

- Commit graph
- Branch
- Remote branch
- Tag
- Search
- Commit detail
- Diff
- Checkout
- Refresh
- Dark/light theme

**Chưa cần**:

- Merge
- Rebase
- Cherry-pick
- Reset
- Stash
- Interactive rebase

Sau khi graph engine ổn định mới thêm.

---

# Kiến trúc cuối cùng nên hướng tới

```text
                    VS CODE
                       │
             ┌─────────▼─────────┐
             │   Extension Host  │
             │                   │
             │ Command Registry  │
             │ Repository Manager│
             │ Git Service       │
             │ Graph Service     │
             │ Cache Service     │
             │ Watcher           │
             └─────────┬─────────┘
                       │
                  Git CLI
                       │
                ┌──────▼──────┐
                │ Git Repo    │
                └─────────────┘


                       │
                  Message Bus
                       │
             ┌─────────▼─────────┐
             │      Webview      │
             │                   │
             │ React             │
             │ Zustand           │
             │ Virtual List      │
             │ SVG Graph         │
             └───────────────────┘
```

Điểm quan trọng nhất là **tách `Git Core → Graph Engine → UI` thành 3 layer độc lập**. Khi đó bạn có thể test graph algorithm bằng dữ liệu giả mà không cần VS Code/Git thật, đồng thời sau này đổi SVG → Canvas hoặc React → framework khác cũng không ảnh hưởng Git engine.

Nếu mục tiêu của bạn là **tự build một extension gần giống Git Graph hiện có**, bước tiếp theo hợp lý nhất là mình có thể lên tiếp **Phase 0 → Phase 1 thành một coding plan cực chi tiết theo từng task/file/class/interface**, bao gồm cả **prompt cho AI agent để implement từng task và checklist review/test**.
