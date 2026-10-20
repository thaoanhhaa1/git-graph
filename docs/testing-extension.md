# Hướng dẫn build và test extension

Tài liệu này hướng dẫn từng bước để build dự án thành VS Code extension và kiểm thử extension trên VS Code.

## 1. Chuẩn bị môi trường

1. Cài Node.js và npm theo yêu cầu của repo:
   - Node.js `>=20.0.0`
   - npm `>=10.0.0`
2. Cài Git và kiểm tra lệnh `git` chạy được trong terminal:

   ```sh
   git --version
   ```

3. Cài VS Code.
4. Mở terminal tại thư mục gốc repo:

   ```sh
   cd /path/to/git-graph
   ```

## 2. Cài dependencies

Chạy lệnh sau ở thư mục gốc repo:

```sh
npm ci
```

Lệnh này cài dependencies cho toàn bộ npm workspaces, bao gồm extension, webview và các package dùng chung.

## 3. Build toàn bộ dự án

Chạy build ở root repo:

```sh
npm run build
```

Lệnh này build các workspace cần thiết, bao gồm:

- `apps/extension`: mã TypeScript của VS Code extension.
- `apps/webview`: giao diện webview được nhúng vào extension.
- `packages/*`: các package runtime mà extension sử dụng.

## 4. Chuẩn bị asset cho VSIX

Sau khi build xong, chạy:

```sh
npm run prepare:vsix
```

Lệnh này copy các artifact cần thiết vào `apps/extension`, bao gồm:

- Webview build output từ `apps/webview/dist` vào `apps/extension/dist/webview`.
- Runtime package build output từ `packages/*/dist` vào `apps/extension/node_modules/@git-graph/*`.
- `README.md`, `CHANGELOG.md` và `LICENSE` vào thư mục extension.

## 5. Đóng gói thành file VSIX

Chạy lệnh package ở root repo:

```sh
npm run package
```

Lệnh này sẽ tự chạy `npm run build`, `npm run prepare:vsix`, sau đó gọi script package của workspace extension.

File extension sau khi build sẽ nằm tại:

```text
dist/vscode-git-graph-0.1.0.vsix
```

## 6. Cài extension vào VS Code để test

Có 2 cách cài file VSIX.

### Cách 1: Cài bằng giao diện VS Code

1. Mở VS Code.
2. Mở tab Extensions.
3. Chọn menu `...` ở góc trên của tab Extensions.
4. Chọn `Install from VSIX...`.
5. Chọn file:

   ```text
   dist/vscode-git-graph-0.1.0.vsix
   ```

6. Reload VS Code nếu được yêu cầu.

### Cách 2: Cài bằng command line

Chạy từ thư mục gốc repo:

```sh
code --install-extension dist/vscode-git-graph-0.1.0.vsix
```

Nếu VS Code không nhận lệnh `code`, mở VS Code rồi chạy command `Shell Command: Install 'code' command in PATH` từ Command Palette.

## 7. Test extension sau khi cài

1. Mở VS Code ở một folder có Git repository:

   ```sh
   code /path/to/a/git-repository
   ```

2. Mở Command Palette:
   - macOS: `Cmd+Shift+P`
   - Windows/Linux: `Ctrl+Shift+P`
3. Chạy command:

   ```text
   Git Graph: View Git Graph
   ```

4. Kiểm tra các chức năng chính:
   - Extension mở được Git Graph webview.
   - Danh sách repository hiển thị đúng.
   - Branch, tag, commit và changed files hiển thị đúng.
   - Tìm kiếm commit hoạt động.
   - Chọn commit hiển thị chi tiết commit.
   - Xem diff/file revision hoạt động.
   - Checkout ref hoặc tạo branch/tag hoạt động theo đúng preflight check.

## 8. Test nhanh bằng Extension Development Host

Nếu muốn test trong môi trường dev mà không cần cài VSIX:

1. Mở repo này bằng VS Code.
2. Chạy build trước:

   ```sh
   npm run build
   ```

3. Mở tab Run and Debug.
4. Chọn cấu hình `Extension Development Host`.
5. Nhấn `F5`.
6. Trong cửa sổ VS Code mới, mở một Git repository và chạy command:

   ```text
   Git Graph: View Git Graph
   ```

Cấu hình debug hiện dùng `apps/extension` làm `extensionDevelopmentPath` và chạy task `npm: build` trước khi mở Extension Development Host.

## 9. Cập nhật và test lại sau khi sửa code

Sau mỗi lần sửa code, build và đóng gói lại:

```sh
npm run package
```

Sau đó cài lại VSIX:

```sh
code --install-extension dist/vscode-git-graph-0.1.0.vsix --force
```

Reload VS Code rồi test lại command `Git Graph: View Git Graph`.

## 10. Kiểm tra chất lượng trước khi đóng gói

Trước khi gửi bản build cho người khác test, nên chạy:

```sh
npm run typecheck
npm run lint
npm test
npm run package
```

Nếu các lệnh này pass, file VSIX trong `dist/` đã sẵn sàng để cài và kiểm thử thủ công.

## 11. Xử lý lỗi thường gặp

- Nếu `npm ci` lỗi, kiểm tra lại phiên bản Node.js và npm.
- Nếu `npm run build` báo thiếu webview output, chạy lại `npm run build` ở root repo thay vì chỉ build riêng extension.
- Nếu `npm run prepare:vsix` lỗi vì thiếu `dist`, bảo đảm các package và webview đã build thành công.
- Nếu `npm run package` lỗi do thiếu `vsce`, npm sẽ dùng `npx @vscode/vsce` theo script trong `apps/extension/package.json`.
- Nếu VS Code không nhận lệnh `code`, cài command line launcher bằng Command Palette của VS Code.
- Nếu extension không xuất hiện sau khi cài VSIX, reload VS Code hoặc gỡ bản cũ rồi cài lại bằng `code --install-extension dist/vscode-git-graph-0.1.0.vsix --force`.
- Nếu command `Git Graph: View Git Graph` không hiển thị dữ liệu, mở workspace là một Git repository và kiểm tra `git rev-parse --show-toplevel` chạy được trong terminal.
