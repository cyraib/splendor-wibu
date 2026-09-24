# Custom Splendor Online

Website board game multiplayer 2–4 người theo luật trong `Gamerule.txt`. Người chơi không cần tài khoản: nhập nickname, tạo phòng, gửi invite link và chơi realtime. Server là nguồn sự thật duy nhất cho room, lượt, token, card, Noble và kết quả.

## Tech stack

- React 18 + TypeScript + Vite
- Node.js + Express + Socket.IO
- Zod validation
- Vitest (engine/integration) + Playwright (browser E2E)
- In-memory RoomManager, được tách khỏi socket layer để có thể thay storage bằng Redis/database sau này

## Chạy local

Yêu cầu Node.js 20+.

```bash
npm install
npm run dev
```

Mở `http://localhost:5173`. Socket server chạy ở `http://localhost:3001`.

Các command chính:

```bash
npm run dev
npm test
npm run test:e2e
npm run build
npm start
```

`npm run build` sinh lại và kiểm tra card manifest, build frontend vào `dist/`, rồi compile server vào `dist-server/`. Sau build, `npm start` phục vụ cả API/Socket.IO, card artwork và SPA qua port 3001.

## Room flow

1. Nhập nickname và chọn **Create Room**.
2. Host chọn chính xác mode 2, 3 hoặc 4 người.
3. Copy link `/room/:roomId` và gửi cho người chơi khác.
4. Người nhận mở link, nhập nickname và vào thẳng lobby.
5. Start chỉ bật khi số người đang kết nối bằng đúng mode.
6. Refresh/mất mạng không tạo người mới: `playerSessionId` trong localStorage nối lại đúng seat và game state.

Room tối đa 4 người, có mã ngẫu nhiên bảo mật, host transfer khi disconnect và cleanup theo `ROOM_TTL_MS`. Active rooms hiện lưu trong memory nên một production instance phải dùng sticky session; để scale ngang, thay RoomManager bằng Redis adapter/storage.

## Luật và game engine

`Gamerule.txt` là source of truth. Engine thuần TypeScript nằm trong `server/game/`, không phụ thuộc React, DOM hay Socket.IO. Engine hỗ trợ:

- setup đúng cho 2/3/4 người;
- lấy 3 màu khác nhau hoặc 2 cùng màu khi bank có ít nhất 4;
- mua card mở/card reserve, permanent discount và Joker;
- reserve card mở hoặc top-deck bí mật, tối đa 3;
- giới hạn 10 token với phase trả token bắt buộc;
- Noble tự nhận/chọn một khi đủ nhiều;
- mốc 15 điểm, hoàn thành vòng, tie-break ít development card hơn;
- shared victory nếu vẫn hòa.

Client chỉ gửi intent. Mọi payload được Zod validate, server kiểm tra player/room/turn/resource rồi gửi một `PlayerGameView` riêng cho từng socket. ID của card reserve top-deck không xuất hiện trong state gửi cho đối thủ.

## Card data và artwork

- Metadata nguồn: `Raw Asset/Assets/_created/card_data.csv` và `nobles_data.csv`.
- Artwork hoàn thiện: `Raw Asset/Assets/_created/Tier1`, `Tier2`, `Tier3`, `Nobles`.
- Generated manifest: `shared/data/cards.json` và `nobles.json`.
- 90 development cards: 40 Tier 1, 30 Tier 2, 20 Tier 3.
- 10 Noble.

Chạy `npm run generate:data` để validate số lượng, ID, tier, bonus, cost/requirement và mapping ảnh. Asset gốc không bị sửa hoặc duplicate. Express phục vụ ảnh qua `/card-assets`; Socket.IO chỉ gửi ID và số liệu.

## Resource artwork

`ResourceToken` dùng ảnh Quartz, Diamond, Emerald, Gold, Netherite và Prismatic Shard (Joker) từ `Raw Asset/Assets đá`. Mapping nằm ở `client/src/config/resources.ts`; bước build copy sáu ảnh này vào `dist/resource-assets`.

## Tests

`npm test` chạy unit/integration tests cho setup 2/3/4, lượt, token action, mua/discount/Joker, reserve/limit/privacy, token limit, Noble, kết thúc/tie-break, room start, room full, reconnect và ba Socket.IO clients realtime.

`npm run test:e2e` chạy Chromium với nhiều browser context cho lobby/start/action của 2, 3 và 4 người. Test hai người còn chụp board 1440×900 vào `test-results/` để visual QA.

## Environment

Sao chép `.env.example` hoặc cấu hình các biến trên host:

```text
PORT=3001
CLIENT_URL=http://localhost:5173
VITE_SERVER_URL=http://localhost:3001
ROOM_TTL_MS=21600000
```

Ở production, build frontend với `VITE_SERVER_URL` rỗng hoặc cùng origin với server. `CLIENT_URL` phải là origin public của frontend.

## Deploy

Chế độ Socket.IO/local cần một Node host hỗ trợ WebSocket lâu dài, ví dụ Railway, Render, Fly.io hoặc VPS.

1. Upload repo kèm `Raw Asset/Assets/_created`.
2. Build command: `npm install && npm run build`.
3. Start command: `npm start`.
4. Set `PORT`, `CLIENT_URL`, `ROOM_TTL_MS`; bảo đảm WebSocket được proxy qua.
5. Dùng persistent single instance cho bản memory hiện tại. Khi scale nhiều instance, thêm Socket.IO Redis adapter và Redis-backed RoomManager.

Lưu ý này chỉ áp dụng cho chế độ Socket.IO với room lưu trong memory. Production trên Vercel dùng Supabase để lưu room và Vercel Functions để xử lý action.

### Supabase + Vercel

Project cũng có production transport dành riêng cho Supabase + Vercel. Khi `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` tồn tại lúc build, client tự chuyển từ Socket.IO sang Vercel HTTP actions + Supabase Realtime signals. Local development không có các biến này vẫn chạy Socket.IO như cũ.

1. Tạo một Supabase project.
2. Mở SQL Editor và chạy `supabase/migrations/001_rooms.sql`.
3. Import repository vào Vercel; `vercel.json` đã cấu hình SPA route và `npm run build:vercel`.
4. Khai báo các environment variables trong Vercel:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<secret-key-server-only>
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<public-publishable-key>
```

Không bao giờ đặt service-role key trong biến bắt đầu bằng `VITE_`; mọi biến `VITE_*` được đưa vào browser bundle. Client chỉ subscribe bảng `room_signals`, bảng này chứa room ID/version chứ không chứa gameplay state. `game_rooms` không có client RLS policy và chỉ Vercel Function dùng service role mới đọc được.

Mỗi intent được Vercel Function nạp state, chạy lại game engine server-authoritative và ghi bằng compare-and-swap. Nếu hai action đến cùng lúc, chỉ một version được commit; action còn lại đọc state mới và validate lại. Card reserve úp chỉ xuất hiện trong private view trả về đúng session.

Build Vercel copy 100 card render vào `dist/card-assets` và sáu resource icon vào `dist/resource-assets`; asset nguồn không bị chỉnh sửa. `.gitignore` giữ các bản artwork gốc và preview không dùng trong build ở máy local, nên repo chỉ chứa rendered cards/nobles, CSV và resource icons cần thiết để build.

## Cấu trúc

```text
client/                 React UI, pages, components, resource mapping
server/game/            game engine, rules, private player views
server/rooms/           RoomManager
server/sockets/         validated Socket.IO protocol
shared/types/           shared gameplay/event types
shared/data/            generated card manifests
tests/                  unit, integration, multiplayer tests
tests/e2e/              multi-context browser flows
```

Các vấn đề cần user xác nhận và phương án đang áp dụng nằm trong `askme.md`.
