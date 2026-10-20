# TÀI LIỆU TÍCH HỢP QR CODE DÀNH CHO FRONTEND (MOBILE & WEB)

Tài liệu hướng dẫn chi tiết dành cho đội ngũ phát triển **Frontend (Mobile App: Flutter / React Native / Native; Web App: ReactJS / Vue / Angular)** để tích hợp tính năng **Tạo mã QR** và **Quét mã QR**.

---

## 1. Kiến Trúc & Luồng Xử Lý (Flow Hoạt Động)

Hệ thống thiết kế theo cơ chế **Backend-Driven Navigation**:
* **Không hardcode `if-else` trên FE**: Frontend không cần biết cụ thể mã QR thuộc loại nghiệp vụ nào (văn bản, ca trực, ký số...). FE chỉ cần gửi chuỗi quét được lên Backend, Backend sẽ phân tích và trả về đúng **loại điều hướng (`actionType`)** cùng với đường dẫn tương ứng (`deepLink` hoặc `webUrl`).
* **Không dùng QRToken trung gian**: Mã QR chứa trực tiếp chuỗi `payload` động.

```
┌──────────────┐          1. Quét mã QR           ┌──────────────────────────────┐
│  Camera FE   │ ───────────────────────────────> │ Chuỗi thô (qrContent)        │
└──────────────┘                                  └──────────────┬───────────────┘
                                                                 │
                                                   2. POST /api/qr/resolve
                                                                 │
                                                                 ▼
┌──────────────┐       3. Trả về actionType       ┌──────────────────────────────┐
│  Mobile/Web  │ <─────────────────────────────── │   Backend eOffice API        │
└──────┬───────┘          + deepLink / webUrl     └──────────────────────────────┘
       │
       ├── [INTERNAL_APP] ──> Mở màn hình nội bộ App (deepLink)
       ├── [INTERNAL_WEB] ──> Mở In-App WebView trong App (webUrl)
       ├── [EXTERNAL_APP] ──> Mở App ngoài (Zalo, Teams, Momo, Banking... qua deepLink)
       └── [EXTERNAL_WEB] ──> Mở trình duyệt ngoài của máy (Safari / Chrome qua webUrl)
```

---

## 2. Bảng 4 Loại `actionType` Chuẩn

Backend sẽ luôn trả về 1 trong 4 loại `actionType` chuẩn sau:

| `actionType` | Ý nghĩa | Cách FE xử lý | Trường dữ liệu cần đọc |
| :--- | :--- | :--- | :--- |
| **`INTERNAL_APP`** | Mở màn hình con nội bộ trong ứng dụng eOffice | Dùng Router nội bộ (GoRouter / Navigator / React Navigation) hoặc mở URL scheme `eoffice://` | `res.data.deepLink` |
| **`INTERNAL_WEB`** | Mở trang web nội bộ thuộc hệ thống eOffice | Mở bằng **In-App WebView** nhúng trong ứng dụng (giữ nguyên session/token) | `res.data.webUrl` |
| **`EXTERNAL_APP`** | Mở ứng dụng bên thứ ba cài trên máy | Gọi hàm mở app ngoài qua scheme (ví dụ: `zalo://`, `momo://`, `vneid://`, `msteams://`) | `res.data.deepLink` |
| **`EXTERNAL_WEB`** | Mở trang web bên ngoài | Mở bằng **trình duyệt mặc định của hệ thống** (Safari trên iOS hoặc Chrome trên Android) | `res.data.webUrl` |

---

## 3. Chi Tiết API 1: Tạo Mã QR (`POST /api/qr/generate`)

Dùng khi Frontend cần tạo mã QR cho người khác hoặc thiết bị khác quét.

* **Method:** `POST`
* **URL:** `{{base_url}}/api/qr/generate`
* **Authentication:** **Bắt buộc** (Bearer Token)
* **Headers:**
  ```http
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json
  X-Device-UDID: <device-udid>   <-- (Tùy chọn: BE tự lấy nếu body không truyền UDID)
  ```

### Request Body:
```json
{
  "udid": "iphone-15-pro-udid-12345",
  "payload": "{\"documentId\":\"doc-101\",\"action\":\"SIGN_APPROVAL\"}",
  "deepLink": "eoffice://document/detail?id=doc-101",
  "webUrl": "https://eoffice.tcs.vn/documents/doc-101",
  "displayName": "Tài liệu phê duyệt số doc-101"
}
```

### Mô tả tham số Request:
| Field | Kiểu | Bắt buộc | Ghi chú |
| :--- | :--- | :---: | :--- |
| `payload` | String | **Có** | Chuỗi nội dung động vẽ lên mã QR (chuỗi plain text hoặc JSON string). |
| `udid` | String | Không | Unique Device ID. Nếu không truyền, BE tự động lấy từ header `X-Device-UDID`. |
| `deepLink` | String | Không | Link điều hướng vào app cho máy quét mở (ví dụ: `eoffice://...`). |
| `webUrl` | String | Không | Link web portal tương ứng (ví dụ: `https://eoffice.tcs.vn/...`). |
| `displayName` | String | Không | Tên gợi nhớ của mã QR (để log hoặc hiển thị). |

> **Lưu ý:** Client **không cần gửi trường `actionType`**. Backend sẽ tự động phân tích `deepLink` và `webUrl` để xác định loại hành động tối ưu nhất.

### Response Body (`200 OK`):
```json
{
  "data": {
    "blobUrl": "https://tcseoffice.blob.core.windows.net/eoffice/qrcodes/3fa85f64-5717-4562-b3fc-2c963f66afa6/iphone-15-pro-udid-12345.png",
    "blobName": "qrcodes/3fa85f64-5717-4562-b3fc-2c963f66afa6/iphone-15-pro-udid-12345.png",
    "isReused": false,
    "payloadHash": "3b29c54e70e949989b53147efb6d081f2115ad14c9c1b979ec7d5d2bb91f24d7"
  },
  "totalRecord": 0
}
```

* `blobUrl`: Đường dẫn ảnh PNG của mã QR lưu trên Azure Storage. Frontend chỉ việc hiển thị lên UI (`<img src="...">` hoặc `Image.network(...)`).
* `isReused`:
  * `true`: Nội dung payload không thay đổi so với lần trước $\rightarrow$ BE tái sử dụng ảnh blob cũ mà không cần vẽ lại (tối ưu tốc độ).
  * `false`: Thông tin mới hoặc thay đổi $\rightarrow$ BE đã ghi đè ảnh mới lên Blob.

---

## 4. Chi Tiết API 2: Quét & Phân Giải Hành Động (`POST /api/qr/resolve`)

Dùng ngay khi camera Mobile/Web quét trúng một mã QR bất kỳ.

* **Method:** `POST`
* **URL:** `{{base_url}}/api/qr/resolve`
* **Authentication:** **Không bắt buộc** (`[AllowAnonymous]` - có hoặc không có token đều dùng được).
* **Headers:**
  ```http
  Content-Type: application/json
  ```

### Request Body:
```json
{
  "qrContent": "{\"documentId\":\"doc-101\",\"action\":\"SIGN_APPROVAL\"}"
}
```

### Mô tả tham số Request:
| Field | Kiểu | Bắt buộc | Ghi chú |
| :--- | :--- | :---: | :--- |
| `qrContent` | String | **Có** | Toàn bộ chuỗi thô nhận được từ camera sau khi quét mã QR. |

### Response Body (`200 OK`):
```json
{
  "data": {
    "deepLink": "eoffice://document/detail?id=doc-101",
    "webUrl": "https://eoffice.tcs.vn/documents/doc-101",
    "actionType": "INTERNAL_APP",
    "displayName": "Tài liệu phê duyệt số doc-101",
    "data": {
      "documentId": "doc-101",
      "action": "SIGN_APPROVAL"
    }
  },
  "totalRecord": 0
}
```

### Mô tả dữ liệu Response:
| Field | Kiểu | Ghi chú |
| :--- | :--- | :--- |
| `actionType` | String | **1 trong 4 loại chuẩn:** `INTERNAL_APP`, `INTERNAL_WEB`, `EXTERNAL_APP`, `EXTERNAL_WEB`. |
| `deepLink` | String? | Đường dẫn ứng dụng (dùng khi actionType là `INTERNAL_APP` hoặc `EXTERNAL_APP`). |
| `webUrl` | String? | Đường dẫn trang web (dùng khi actionType là `INTERNAL_WEB` hoặc `EXTERNAL_WEB`). |
| `displayName`| String? | Tiêu đề nghiệp vụ của mã QR (nếu có). |
| `data` | Object? | Dữ liệu gốc đã được parse sang dạng JSON object (nếu payload là JSON hợp lệ). |

---

## 5. Mẫu Code Triển Khai Cho Frontend

### 5.1. Mẫu Code Mobile Flutter (Dart)

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

Future<void> onScanQRCodeSuccess(String scannedRawString) async {
  try {
    // 1. Gọi API phân giải mã QR
    final response = await http.post(
      Uri.parse('$baseUrl/api/qr/resolve'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'qrContent': scannedRawString}),
    );

    if (response.statusCode != 200) {
      showToast('Lỗi giải mã QR: ${response.statusCode}');
      return;
    }

    final resData = jsonDecode(response.body)['data'];
    final String actionType = resData['actionType'] ?? 'INTERNAL_APP';
    final String? deepLink = resData['deepLink'];
    final String? webUrl = resData['webUrl'];

    // 2. Điều hướng theo 4 loại actionType
    switch (actionType) {
      case 'INTERNAL_APP':
        // Mở màn hình nội bộ App eOffice
        if (deepLink != null && deepLink.isNotEmpty) {
          AppRouter.navigateTo(deepLink); // Dùng GoRouter hoặc Navigator của dự án
        }
        break;

      case 'INTERNAL_WEB':
        // Mở In-App WebView nhúng trong app
        if (webUrl != null && webUrl.isNotEmpty) {
          await launchUrl(Uri.parse(webUrl), mode: LaunchMode.inAppWebView);
        }
        break;

      case 'EXTERNAL_APP':
        // Mở ứng dụng bên ngoài (Zalo, Teams, Banking, Momo...)
        if (deepLink != null && deepLink.isNotEmpty) {
          await launchUrl(Uri.parse(deepLink), mode: LaunchMode.externalNonBrowserApplication);
        }
        break;

      case 'EXTERNAL_WEB':
        // Bật trình duyệt ngoài của hệ thống (Safari / Chrome)
        if (webUrl != null && webUrl.isNotEmpty) {
          await launchUrl(Uri.parse(webUrl), mode: LaunchMode.externalApplication);
        }
        break;
    }
  } catch (e) {
    showToast('Không thể xử lý mã QR: $e');
  }
}
```

---

### 5.2. Mẫu Code React Native (TypeScript)

```typescript
import { Linking, Alert } from 'react-native';
import api from './api';

const onScanQRCodeSuccess = async (scannedRawString: string, navigation: any) => {
  try {
    const res = await api.post('/api/qr/resolve', { qrContent: scannedRawString });
    const { actionType, deepLink, webUrl, data } = res.data?.data || {};

    switch (actionType) {
      case 'INTERNAL_APP':
        // 1. Mở màn hình nội bộ App
        if (deepLink) {
          navigation.navigate('RouterHandlerScreen', { deepLink });
        }
        break;

      case 'INTERNAL_WEB':
        // 2. Mở In-App WebView nhúng trong App
        if (webUrl) {
          navigation.navigate('InAppWebViewScreen', { url: webUrl });
        }
        break;

      case 'EXTERNAL_APP':
        // 3. Mở App ngoài qua App Scheme (Zalo, Teams, Banking...)
        if (deepLink && (await Linking.canOpenURL(deepLink))) {
          await Linking.openURL(deepLink);
        } else {
          Alert.alert('Thông báo', 'Thiết bị chưa cài đặt ứng dụng này.');
        }
        break;

      case 'EXTERNAL_WEB':
        // 4. Mở trình duyệt web ngoài của hệ thống (Safari/Chrome)
        if (webUrl) {
          await Linking.openURL(webUrl);
        }
        break;

      default:
        Alert.alert('Nội dung mã QR', JSON.stringify(data));
        break;
    }
  } catch (error) {
    Alert.alert('Lỗi', 'Không thể xử lý mã QR này.');
  }
};
```

---

### 5.3. Mẫu Code Web Portal (ReactJS / VueJS)

```javascript
async function handleScanWeb(scannedRawString) {
  try {
    const res = await axios.post('/api/qr/resolve', { qrContent: scannedRawString });
    const { actionType, webUrl, deepLink } = res.data.data;

    if (actionType === 'INTERNAL_WEB' || actionType === 'EXTERNAL_WEB') {
      if (webUrl) {
        // Nếu là link nội bộ cùng origin -> điều hướng SPA
        if (webUrl.startsWith('/') || webUrl.includes(window.location.origin)) {
          router.push(webUrl.replace(window.location.origin, ''));
        } else {
          // Mở tab mới nếu là link web ngoài
          window.open(webUrl, '_blank');
        }
      }
    } else {
      // Đối với môi trường Web nếu gặp deepLink app (eoffice://...)
      if (webUrl) {
        window.location.href = webUrl;
      } else {
        alert('Mã QR này chỉ dành riêng cho ứng dụng Mobile.');
      }
    }
  } catch (err) {
    console.error('Lỗi phân giải QR:', err);
  }
}
```

---

## 6. Bảng Mã Lỗi & Xử Lý (Error Handling)

| HTTP Status | Nguyên nhân | FE nên xử lý |
| :--- | :--- | :--- |
| `400 Bad Request` | `payload` hoặc `qrContent` để trống hoặc định dạng dữ liệu không hợp lệ. | Hiển thị thông báo từ `res.message` (ví dụ: *"Nội dung mã QR không được để trống"*). |
| `401 Unauthorized` | Token đăng nhập bị hết hạn ở API `POST /api/qr/generate`. | Chuyển hướng người dùng về màn hình Đăng nhập. |
| `500 Server Error` | Lỗi kết nối Azure Blob Storage hoặc Database Server. | Hiển thị: *"Hệ thống tạm thời bận, vui lòng thử lại sau"*. |
