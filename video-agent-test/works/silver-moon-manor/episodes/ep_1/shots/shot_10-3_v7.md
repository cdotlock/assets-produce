---
shot_id: shot_10-3_v7
duration: 12s
mode: 首尾帧双锚（first_frame + last_frame 强制锁定站位+演变化）
scene: 新月领地公墓
emotion_arc: 干燥眨眼 → 颤抖叫名同时眼眶泛红 → Kennedy 嘴角缓慢勾起 → James 倒吸气未答 → 一颗泪从无到有滑落
version: v7 首尾帧双锚版（突破单首帧的"站位 vs 动态"二选一困境）
vs_v6_root_fix: |
  v6 失败根因（用户精准诊断）：单首帧模式下 Seedance 修正了不稳定姿态——
  - 首帧情绪饱满（v5）→ 站位保持但动态不变
  - 首帧情绪留白（v6）→ 动态有微弱变化但站位崩
  这是单首帧的 trade-off。

  v7 突破方案：首尾帧双锚定。
  - 首帧锚图（@图1 first_frame）= works/silver-moon-manor/ref-frames/ep_1/shot_10-3_anchor_v2.jpg
    Sylvia 干燥 + James 跪 + 距离远 + Kennedy 中性
  - 尾帧锚图（@图2 last_frame）= works/silver-moon-manor/ref-frames/ep_1/shot_10-3_anchor_v2_end.jpg
    Sylvia 一颗泪痕 + James 跪 + 距离远 + Kennedy 嘴角勾起
  - 两端站位完全一致 → Seedance 没机会"修正"成站立默认状态
  - 两端情绪从无到有 → Seedance 必须演变化

  方法论：动态属性必须留白 + 关键站位必须双锚锁定。

ab_compare_with: shot_10-3, shot_10-3_v2, shot_10-3_v4, shot_10-3_v5, shot_10-3_v6
compare_note: 七版对照（v3/v4_pro 移出对比组保留备查）。v1 平铺；v2 工程化；v4 短剧锚图错；v5 锚图修正但 Sylvia 已含泪眼泪不动；v6 动态留白但 12s 内站位被修正崩坏；v7 = 首尾帧双锚（首帧 v2 干燥 + 尾帧 v2 已含泪痕，站位两端锁定动态强制变化）+ 标准版模型。重点验证：v7 是否同时拿下"站位保持 + 眼泪从无到有 + 嘴角缓慢勾起 + 愧疚加深"四个维度。

# 首尾帧双锚关键字段（gen_ep_video.py 支持的新字段）
first_frame: works/silver-moon-manor/ref-frames/ep_1/shot_10-3_anchor_v2.jpg
last_frame: works/silver-moon-manor/ref-frames/ep_1/shot_10-3_anchor_v2_end.jpg

# 重要：ARK 首尾帧模式不接受额外的 reference_image，立绘必须移除
# 人物身份完全靠首帧+尾帧本身定义（Sylvia 黑色长裙 / James 羊绒大衣 / Kennedy 黑色风衣已经在锚图里）
assets:
  images: []
  videos: []
---

韩漫画风，2D 动漫风格画风，9:16 竖屏尺寸，9:16 竖屏尺寸，9:16 竖屏尺寸。视觉风格硬约束（non-photorealistic stylization lock）：全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，非写实渲染 non-photorealistic rendering，简化五官 simplified cartoon facial features but with clearly visible emotional expressions（动漫大眼平涂但情绪表达必须强烈可见——含泪、嘴唇颤抖、嘴角下撇、眉头紧锁等可见可读）；Korean webtoon illustration style；所有人物脸部必须呈现明显动漫化简笔特征但情绪外显丰富立体；严禁摄影质感/写实渲染/3D 渲染/真人相片外观。严格遵循参考图中场景的空间关系，禁止人物瞬移、镜头跳跃、空间关系改变和物理穿模。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无水印（注：远景墓碑可能可见的英文姓名属于场景元素的合理存在不算字幕）。

@图1 作为首帧（first_frame，承接干燥起点状态），@图2 作为尾帧（last_frame，到达泪痕终点状态）。本镜走首尾帧双锚模式——三人空间关系（Sylvia 站立画面左、James 单膝跪在画面右下方草地、Kennedy 侧坐 James 怀中、Sylvia 与 James 之间 2-3 米距离不接触）在首帧和尾帧严格一致、本镜整段 12s 必须严格保持此空间关系不变；情绪状态从首帧的干燥/中性演变为尾帧的泪痕/挑衅/愧疚加深。

【双锚强制约束】
站位锁定：本镜全程严格保持首帧+尾帧共同定义的站位——
- Sylvia 始终站立画面左侧不向右移动
- James 始终单膝跪姿不站起来
- Kennedy 始终侧坐 James 怀中不站起来
- 三人始终 2-3 米距离不靠近
- James 的双手始终只揽抱 Kennedy 严禁触碰 Sylvia 或 Sylvia 的孕肚

情绪演变：本镜全程必须从首帧状态平滑演变到尾帧状态——
- Sylvia 眼睛：从首帧的干燥 → 6s 时眼眶充满泪光 → 11-12s 时一颗泪滑过脸颊形成尾帧的泪痕
- Kennedy 嘴角：从首帧的中性平直 → 4-5s 时缓慢勾起到尾帧的 15° 挑衅弧度
- James 表情：从首帧的中性 → 5-7s 时眉头加锁、嘴角向下撇愧疚加深 → 10-11s 时倒吸一口气

故事线（7 个节拍 · 时间分段强制状态变化）：

(a) 0-2s · 承接首帧干燥起点：
    - 三人维持首帧站位完全静止
    - Sylvia 嘴唇微颤一下 + 眼眶仍干燥但开始有湿意

(b) 2-4s · Sylvia 颤抖叫名 + 眼眶泛红：
    - Sylvia 颤抖压低带哭腔几乎从喉咙挤出地说："Kennedy."
    - Sylvia 眼眶湿润度从 0% → 30%

(c) 4-5.5s · Kennedy 嘴角缓慢勾起：
    - Kennedy 嘴角从中性平直缓慢勾起约 1.5 秒到 15° 挑衅弧度
    - 眼睛微眯带胜利感
    - Sylvia 眼眶湿润度 30% → 50%

(d) 5.5-7s · James 表情愧疚加深：
    - James 眉头从略锁到深锁
    - James 嘴角从中性向下撇成愧疚弧度
    - James 头部维持低头看 Kennedy 不抬头
    - Sylvia 眼眶湿润度 50% → 70%

(e) 7-10s · Sylvia 颤抖追问 + 泪水充满：
    - Sylvia 哽咽颤抖追问："What is the relationship between you and her?"（说到"between"声音短暂破一下）
    - Sylvia 眼眶湿润度 70% → 100%（泪水充满悬在睫毛上）

(f) 10-11s · James 倒吸气未答 + Sylvia 第一颗泪溢出:
    - James 嘴唇张开倒吸一口气然后立刻闭合
    - James 揽 Kennedy 的手臂潜意识紧一下
    - Sylvia 眼眶里的泪从右眼眶溢出开始向下移动到眼角

(g) 11-12s · 一颗泪滑落到尾帧状态：
    - Sylvia 那颗泪沿脸颊缓慢滑落约 1 秒到达尾帧的泪痕位置
    - 嘴唇压抑抖一下、眉头锁得更紧
    - 最后 0.5s 三人完全静止画面达到尾帧状态保持直至视频结束

人物唯一性铁律：Sylvia 始终仅一人，James 始终仅一人，Kennedy 始终仅一人。同一时刻画面中只有一个 Sylvia、一个 James、一个 Kennedy。严禁分身复制残影。

镜头：全程中景三人构图保持锚图视野，不推不移不摇。

关键场景：① 中景·视平线·静止不推移（全程 12s 锁定锚图视野）。

音效（按情绪节拍分层）：0-2s 承接干燥层【公墓远处风声低 + Sylvia 强忍呼吸鼻音极轻】→ 2-4s Sylvia 哭腔叫名层【Sylvia 颤抖带哭腔叫 "Kennedy." 嘴唇颤动开合清晰 + 钢琴低音单音情绪坠入刺点】→ 4-5.5s Kennedy 嘴角勾起层【低音提琴拉一记低音 + 风过草地落叶声】→ 5.5-7s James 愧疚加深层【James 沉重呼吸鼻音 + 定音鼓极低频一次】→ 7-10s Sylvia 哽咽追问层【Sylvia 颤抖哽咽说话嘴唇开合清晰、说到 "between" 声音短暂破音、钢琴稀疏单音陪衬 + 大提琴低音持续延音】→ 10-11s James 倒吸气未答层【James 倒吸一口气清晰可闻吸气声 + 嘴唇张合极轻气流 + 大提琴音调微微上扬】→ 11-12s 泪落尾帧收尾层【Sylvia 一颗泪滑过脸颊的极致 ASMR 微响 + Sylvia 嘴唇压抑颤动极轻气声 + 大提琴单音长尾渐消至无】。对白【Sylvia 颤抖哽咽两句："Kennedy."（2-4s）+ "What is the relationship between you and her?"（7-10s）、英语口型精准同步且嘴唇明显颤抖、声音带哭腔颤抖有起伏、无字幕；James 与 Kennedy 全程不开口】。

禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、台词文字浮现、字幕条、对话框、弹幕、远景石碑文字被放大或聚焦（远景石碑保持模糊不可读）、画面中同时出现两个及以上 Sylvia/James/Kennedy、角色分身复制、Sylvia 说 "Kennedy." 和 "What is the relationship between you and her?" 以外任何台词、

**【v7 核心方法论强制约束 - 违反即失败】**：
- 站位崩坏（首尾帧双锚已锁定 James 跪 + Kennedy 侧坐怀中 + Sylvia 三米外独立、本镜必须严格保持）
- James 站立起身（必须始终单膝跪姿与首帧+尾帧一致）
- 三人挤在一起距离变近（必须始终保持 2-3 米距离）
- Sylvia 向 James 移动靠近（必须始终站立画面左侧不向右移动）
- James 的手伸向 Sylvia 或触碰 Sylvia 的孕肚（必须只接触 Kennedy）
- Sylvia 眼睛全程保持干燥不变化（必须从干燥渐变到泪水充满到一颗泪滑落到达尾帧泪痕状态）
- 一颗泪从眼眶滑落脸颊的动作没有可见演变（11-12s 必须有清晰可见从眼眶到脸颊的泪滑落动态过程）
- Sylvia 整段没有泪水状态变化（必须有清晰可见的"从无到有"过程符合首帧→尾帧的演变）
- Kennedy 嘴角整段保持平直不变化（必须从中性缓慢勾起到 15° 挑衅弧度的可见变化过程）
- Kennedy 嘴角直接从首帧就是挑衅笑（首帧是中性必须演变化）
- James 表情整段保持中性不变化（必须从中性低头逐渐演变为眉锁+嘴角下撇愧疚加深的可见过程）
- James 没有倒吸气动作（10-11s 必须有可见可闻的倒吸气）

其他禁止：
Sylvia 哭出声放声大哭、Sylvia 流泪后立即用手擦泪、Sylvia 看镜头、Sylvia 嘴角上扬带笑意、James 松开 Kennedy、James 直接抬头大幅看 Sylvia、James 开口说话发出英文单词、Kennedy 站起来离开 James 怀抱、Kennedy 表情悲伤求助痛苦、Kennedy 开口说话、Sylvia 服装从黑色长裙变为其他、Sylvia 项链消失、首帧刚开始起手使用剧烈动词、画面中出现其他人物、阴云变晴天、公墓石碑位置漂移、远处教堂尖顶消失、Sylvia/James/Kennedy 服装颜色改变、头发长度改变、发型改变、最后 0.5s 任一角色继续可见动作、最后 0.5s 镜头继续运动、镜头任何方向的推移拉远摇摆升降跟拍、切入近景特写大特写、人物头部出画、人物面部被裁切、Sylvia 下半身被裁切、Sylvia 孕肚被完全遮挡、Kennedy 下半身被裁切、人物瞬移、镜头跳跃、空间关系改变、物理穿模、跳帧抽帧、Sylvia/James/Kennedy 分身复制。
