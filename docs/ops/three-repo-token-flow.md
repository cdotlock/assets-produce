# 三仓 Asset Service Token 流向

> Phase 10 (2026-05-15) — assets-produce 对外 `POST /api/v1/assets/{create,status,lookup,catalog-since}` 的 token / project_id 治理。

本文档是运维手册，回答："token 怎么发？跨仓怎么连？rotate / 吊销谁动？401/403 怎么排？"

---

## 1. 名词约束

- **assets-produce** — 本仓库；HTTP server 在 `agent serve`，默认 `:8001`。Asset 的 source-of-truth。
- **novels-to-lunascript (n2m)** — 上游写小说 / LS；本 Phase 只调 `POST /lookup`（不主动 create）。
- **lunaverse-backend** — 下游 BFF；4 个操作（create / status / lookup / catalog-since）全用。
- **project_id** — Asset 的租户隔离 key。命名约定（Phase 10 收口）：`<source>_<slug>`。

  - 来自小说的项目：`novel_silver_moon_manor` / `novel_no_rules_in_bad_ideas` 等
  - 其他来源（demo / 内部测试）：`internal_<slug>` / `dev_<slug>`

---

## 2. Token 矩阵

assets-produce 通过 env 注入 3 个 named token（见 `agent/packages/opencode/src/business/asset-service/http/auth.ts`）：

| Token name (env suffix) | 持有方 | 用途 | 允许的 project_id（建议默认） |
|---|---|---|---|
| `NTMS` | novels-to-lunascript | `POST /lookup` 拉 URL 回填 mapping.json | `novel_*` 系列；CSV 或具体列表 |
| `MSB` | lunaverse-backend | 全部 4 个操作；agent-forge-client.real 切到这里 | `novel_*` 系列；与 NTMS 同范围 |
| `DEV` | 本机开发 / 集成测试 | 全部操作 | `*`（wildcard） |

env 变量名固定：

```
ASSETS_API_TOKEN_<NAME>     # 必填，bearer 值
ASSETS_API_PROJECTS_<NAME>  # CSV 或字面 "*"；不填则 [] = deny-by-default
```

assets-produce server 启动时调 `loadAssetAuthFromEnv()` 读这两组变量并装载到 `makeAssetServiceAuth` 中间件。空 token slot 会被跳过（不报错），方便 dev / staging / prod 部署只装载需要的 slot。

---

## 3. Token 发放流程

### 3.1 新仓接入（如未来加第 4 个 caller）

1. 在 `agent/packages/opencode/src/business/asset-service/http/auth.ts` 的 `TOKEN_NAMES` 常量里加新 name（lowercase，简短，<=6 char）
2. 在 `.env.example` 加 `ASSETS_API_TOKEN_<NEW>` + `ASSETS_API_PROJECTS_<NEW>` 模板
3. 用 `openssl rand -hex 32` 生成 token 值（64 字符 hex；assets-produce 仅做精确字符串比对，不要求格式）
4. 在 assets-produce 部署的 env 注入 token + project 允许列表
5. 把同一个 token 值发给新仓维护方（走加密通道：1Password / 公司密钥库 / GPG email），让他们写到自己仓的 `.env`
6. 跑一条 `curl … -H "Authorization: Bearer <token>"` 联通验证（见 §6）

### 3.2 已在册的 NTMS / MSB / DEV

按上面 3-6 步走，跳过 1-2（已存在）。

---

## 4. Token Rotate / 紧急吊销

### 4.1 定期 rotate（建议季度一次）

1. 生成新 token 值（`openssl rand -hex 32`）
2. assets-produce env 改成新值，重启 server（grace period：旧 token 不再生效）
3. 给对应仓的维护方发新值，让他们改自己的 `.env` 并重启 worker / dev server
4. 联通验证（见 §6）

### 4.2 紧急吊销（token 怀疑泄漏）

1. assets-produce env 立刻清空对应 `ASSETS_API_TOKEN_<NAME>`，重启 server——server 不会装载该 token，所有用旧 token 的请求拿 401
2. 调 `ASSETS_API_PROJECTS_<NAME>=""` 也可（变成 deny-by-default 的 403，但 401 更干净）
3. 等下游确认改完 token 再恢复
4. 提工单 / 通报组里：谁、哪台机器、什么时间疑似泄漏；产出 RCA

### 4.3 Server 端不持久化 token

assets-produce 只在内存里读 env；没有 token store 表，没有 admin API 改 token。这是设计上的简化：所有 token 治理走 env + restart。

---

## 5. 各环境 base URL

| 环境 | assets-produce server | 谁连 |
|---|---|---|
| dev (本机) | `http://localhost:8001` | 本机 n2m / backend dev |
| staging | TBD（部署 ticket 落地后填） | staging backend / 内部 demo |
| prod | TBD（部署 ticket 落地后填） | prod backend |

base URL 路径：`/api/v1/assets/{create,status,lookup,catalog-since}`。OpenAPI 在 `agent/packages/opencode/test/business/asset-service/openapi.test.ts` 的 snapshot 里有完整 spec。

---

## 6. 联通验证（每次发 token 后跑一次）

```bash
# 替换 $BASE / $TOKEN / $PID
curl -sS -X POST "$BASE/api/v1/assets/lookup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d "{\"project_id\":\"$PID\",\"queries\":[{\"key\":\"_ping\"}]}"
```

预期：

- 200 + `{"results":[{"query":{"key":"_ping"},"status":"no_match"}]}` — token 正确、project_id 允许、`_ping` key 不存在（正常）
- 401 — token 不在册或拼错
- 403 — token 在册但 project_id 不在该 token 的允许列表
- 400 — body 形态错（少 project_id / queries 空）

---

## 7. 三仓 .env 对照

| 变量 | assets-produce | n2m | backend |
|---|---|---|---|
| `ASSETS_API_TOKEN_NTMS` | ✅ 发 | ❌ | ❌ |
| `ASSETS_API_TOKEN_MSB` | ✅ 发 | ❌ | ❌ |
| `ASSETS_API_TOKEN_DEV` | ✅ 发（仅 dev / staging） | ❌ | ❌ |
| `ASSETS_API_PROJECTS_NTMS` | ✅ CSV | ❌ | ❌ |
| `ASSETS_API_PROJECTS_MSB` | ✅ CSV | ❌ | ❌ |
| `ASSETS_API_PROJECTS_DEV` | ✅ `*` | ❌ | ❌ |
| `ASSETS_PRODUCE_BASE_URL` | ❌ | ✅ | ✅ |
| `ASSETS_PRODUCE_TOKEN` | ❌ | ✅（= NTMS 的值） | ✅（= MSB 的值） |

注：n2m / backend 不知道任何其他仓的 token；它们只持有自己那个，分别取的是 assets-produce 的 NTMS / MSB slot。

---

## 8. 故障排查速查

| 现象 | 最可能原因 | 验证 |
|---|---|---|
| 全部请求 401 | 自己仓 `ASSETS_PRODUCE_TOKEN` 没填 / 填错 | `echo $ASSETS_PRODUCE_TOKEN` 比对 assets-produce server env 里的对应 slot |
| 单个 project_id 403 | 该 project_id 不在 token 的 `ASSETS_API_PROJECTS_*` 里 | 看 assets-produce server env；按 §1 命名约定核对 |
| 全部请求 connect refused | server 没起 / base URL 错 / 端口被占 | `curl $BASE/api/v1/assets/lookup` 看 connect；netstat / lsof 看端口 |
| lookup 全 `no_match` | project_id 对了但 key 没注册 | 在 assets-produce 这边手动 `agent asset:create` 一条对比，或 `lookup` `_ping` 测连通；真正 key 需要 backend `POST /create` 后才入库 |
| 偶尔 5xx | server 过载 / DB lock / 网络抖 | assets-produce server log；caller 端应有 retry/backoff（n2m client 3 次指数退避；backend 走 BullMQ） |

---

## 9. Out-of-scope（本文档不讲）

- 多租户 / 计量 / 计费（spec §11 Phase 10 "不做"）
- token 自动 rotate 调度（手动季度即可）
- TLS / mTLS（部署层负责，应用层只看 Authorization header）
- 跨 region 容灾（dev / staging / prod 分别独立部署即可）

更新：Phase 11+ 如果引入多租户或 SLA，重写本文档。
