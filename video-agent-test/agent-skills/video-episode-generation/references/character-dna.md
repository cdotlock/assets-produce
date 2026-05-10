# 角色服装锁

仅锁**真正不变**的：服装 / 发型 / 身材 / 孕肚 / 独有配饰。
**不锁**：主灯/色温/焦段/色调（Seedance 弱档不响应）、招牌动作（剧情触发非角色固定）、禁用动作（剧情节点会破除）。

服装数据的**权威源是 `script/ep_X.json` 的 `character_outfits` 字段**——本文件不重复抄、只放跨集需要锁的演进规则。
`character_outfits` 只用于选择/核对正确立绘，不要把具体衣着、外貌、身材、孕肚、配饰逐项抄进最终 prompt；最终 prompt 只保留 `@图N` 主参考约束句。

## 服装演进规则（只在跨集变化时填）

| 角色 | 默认服装来源 | 跨集变化点 |
|---|---|---|
| Sylvia | `ep_X.json::character_outfits.Sylvia` | EP1-EP4 孕期藕粉日常；EP5+ 看场景；墓地戏改黑色长袖 |
| James | `ep_X.json::character_outfits.James` | 全集稳定 |
| Kennedy | `ep_X.json::character_outfits.Kennedy` | 全集黑色 |

写 prompt 前：直接 Read 对应的 `ep_X.json::character_outfits`，用于确认立绘选择是否正确；不要在本文件维护副本，也不要把这些字段整段枚举进 prompt（会失同步，且会稀释参考图约束）。

## 立绘文件映射

| 角色 + 场景类型 | 立绘文件 |
|---|---|
| Sylvia · 日常/厨房 | `{作品}/assets/costume_sylvia.png` |
| Sylvia · 墓地/户外 | `{作品}/assets/Sylvia人物立绘.png` |
| James · 全集 | `{作品}/assets/char_james_portrait.png` |
| Kennedy · 全集 | `{作品}/assets/costume_kennedy.png` |

## 跨镜一致性的真正抓手

不是靠"DNA 表"——靠这三件具体的事：

1. **角色立绘**作为 `assets.images` 锁服装/发型/身材
2. **场景全景图**（如 `scene_kitchen_panorama.png`）作为 `assets.images` 锁空间结构/材质/光温
3. **上一镜末帧 PNG**（`{作品}/episodes/ep_{N}/end-frames/{prev_shot}_end.png`）作为 `assets.images[0]` 锁站位/姿态衔接

**Seedance 实测**：以上三层 reference 的稳定性 >> prompt 文字描述。`prompt 文字写"伦勃朗光 3200K 50mm"` 几乎不响应；`参考图直接给一张` 立刻锁住。
