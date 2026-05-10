---
shot_id: shot_10-3_v6
duration: 12s
mode: 首尾帧（动态留白首帧锚图——Sylvia 干燥/Kennedy 中性/James 中性，把动态属性全部留给 Seedance 演变化）
scene: 新月领地公墓
emotion_arc: 干燥眨眼 → 颤抖叫名同时眼眶泛红 → Kennedy 嘴角缓慢勾起 → James 倒吸气未答 → 一颗泪从无到有滑落
version: v6 动态属性留白方法论验证版（首帧不预定动态属性 + 时间分段强制状态变化 + 标准版模型）
vs_v5_root_fix: |
  v5 失败根因（用户洞察）：v5 锚图里 Sylvia 已经在哭（脸上有泪痕），Seedance 把"含泪"作为静态属性贴每一帧——结果整段视频泪不动。

  v6 唯一修正：换一张"动态留白"锚图。
  - 新锚图 works/silver-moon-manor/ref-frames/ep_1/shot_10-3_anchor_v2.jpg：Sylvia 眼睛干燥不含泪、Kennedy 嘴角中性平直、James 表情中性低头看 Kennedy
  - prompt 用时间分段强制 Seedance 演"从干燥到流泪 / 从中性到挑衅 / 从中性到愧疚加深"的状态变化
  - 模型不能再用静态贴图（首帧没有可贴的"含泪/挑衅/愧疚"状态），必须画动态

  方法论：**首帧锚图必须留白动态属性、给 Seedance 演变化的空间**。
  适用所有动态状态：眼泪、嘴角微笑、表情变化、头部转动等。
# ab_compare_with moved to shot_10-3_v7 (七版对比由 v7 持有)
prev_ab_compare_with: shot_10-3, shot_10-3_v2, shot_10-3_v4, shot_10-3_v5
compare_note: 六版对照（v3/v4_pro 移出对比组保留备查）。v1 平铺；v2 工程化；v4 短剧情绪外显但锚图错；v5 锚图修正但 Sylvia 已含泪导致眼泪不动；v6 = 动态留白锚图（Sylvia 干燥/Kennedy 中性/James 中性）+ 时间分段强制状态变化 + 标准版模型。重点验证：v6 眼泪是否真的"动起来"、Kennedy 嘴角是否"缓慢勾起"。
assets:
  images:
    - works/silver-moon-manor/ref-frames/ep_1/shot_10-3_anchor_v2.jpg
    - works/silver-moon-manor/assets/Sylvia人物立绘.png
    - works/silver-moon-manor/assets/char_james_portrait.png
    - works/silver-moon-manor/assets/costume_kennedy.png
  videos: []
---

韩漫画风，2D 动漫风格画风，9:16 竖屏尺寸，9:16 竖屏尺寸，9:16 竖屏尺寸。视觉风格硬约束（non-photorealistic stylization lock）：全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，非写实渲染 non-photorealistic rendering，简化五官 simplified cartoon facial features but with clearly visible emotional expressions（动漫大眼平涂但情绪表达必须强烈可见——含泪、嘴唇颤抖、嘴角下撇、眉头紧锁等可见可读）；Korean webtoon illustration style；所有人物脸部必须呈现明显动漫化简笔特征但情绪外显丰富立体；严禁摄影质感/写实渲染/3D 渲染/真人相片外观。严格遵循参考图中场景的空间关系，禁止人物瞬移、镜头跳跃、空间关系改变和物理穿模。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无水印（注：@图1 锚图中远处石碑可能可见的英文姓名属于场景元素的合理存在不算字幕，禁止生成新的字幕文字浮现也禁止放大或聚焦这些石碑文字）。@图1 作为首帧。

【动态属性留白原则声明】@图1 首帧锚图刻意留白了三人的动态属性——Sylvia 脸是干燥的不含泪、Kennedy 嘴角是中性平直的、James 表情中性低头但不明显愧疚。这是为了让 Seedance 在 12s 内演"从无到有"的状态变化。本镜的核心任务就是让以下三组动态变化真实可见地发生：
1. **Sylvia 眼睛从干燥 → 眼眶泛红 → 泪水充满 → 一颗泪滑落脸颊**（眼泪从无到有、不是静态贴图）
2. **Kennedy 嘴角从中性平直 → 缓慢勾起 → 挑衅胜利弧度**（笑容从无到有、不是静态贴图）
3. **James 表情从中性低头 → 眉头加锁 → 嘴角下撇愧疚加深 → 倒吸一口气**（愧疚从无到有、不是静态贴图）
模型不得把首帧的"中性表情"作为静态贴图贴每一帧，必须按时间分段演变化。

【首帧空间关系严格继承】@图1 已经精确定义了三人空间关系——画面左侧 Sylvia 站立独立、画面右下方 James 单膝跪在草地上揽抱身旁的 Kennedy、Kennedy 侧坐入画完整、Sylvia 与 James/Kennedy 之间 2-3 米距离无任何接触。本镜整段 12s 必须严格保持此空间关系：Sylvia 始终站立画面左侧不向右移动、James 始终单膝跪姿不站起来、Kennedy 始终侧坐 James 怀中不站起来、三人始终 2-3 米距离不靠近、Sylvia 始终独立不与 James/Kennedy 接触、James 的双臂始终只揽抱 Kennedy 严禁伸向 Sylvia 或触碰孕肚。

一段展现【七个月孕妇 Sylvia 在公墓质问丈夫 James 关系——Sylvia 眼泪从无到有最后一颗滑落、Kennedy 嘴角从中性到挑衅缓慢勾起、James 从中性低头到愧疚加深倒吸气未答】的互动短剧戏剧段。本镜验证"动态属性留白"方法论——所有情绪动态都从首帧的"无"演变为终帧的"有"。

故事线（7 个节拍 · 时间分段强制状态变化）：

(a) 0-2s · 承接首帧干燥状态：
    - Sylvia 眼睛**完全干燥**保持首帧的眼眶状态、嘴唇紧抿
    - Kennedy 嘴角**保持中性平直**、眼神平静
    - James **保持低头看 Kennedy** 表情中性
    - 三人完全静止承接首帧

(b) 2-4s · Sylvia 颤抖叫名 + 眼眶开始泛红：
    - Sylvia 嘴唇微颤 + 颤抖压低带哭腔几乎从喉咙挤出地叫："Kennedy."
    - 同时 Sylvia 的眼眶**从完全干燥开始泛红**（湿润度 0% → 30% 渐变可见）、上眼睑略微下垂带哭意
    - Kennedy 维持中性嘴角不变
    - James 维持低头不动

(c) 4-5.5s · Kennedy 嘴角从中性缓慢勾起：
    - Kennedy 头部从靠在 James 怀中的位置略微抬起一些更面向 Sylvia 方向（小幅度）
    - **关键状态变化**：Kennedy 嘴角从中性平直**缓慢勾起约 1.5 秒**——嘴角在这 1.5 秒内从直线状态逐渐弯成 15° 的不对称挑衅弧度（**模型必须真的演这个嘴角变化过程，不是直接贴一个微笑**）
    - 眼睛微微眯起一下带胜利感
    - 嘴唇紧闭不开口
    - 同期 Sylvia 眼眶湿润度 30% → 50%、James 维持低头

(d) 5.5-7s · James 表情从中性到愧疚加深：
    - James 听到 Kennedy 名字 + 看到 Kennedy 抬头挑衅 → **眉头从略锁到深锁**（眉头紧锁程度变化可见）
    - **嘴角从中性缓慢向下撇**（嘴角从直线弯成下撇弧度约 1.5 秒）
    - 头部维持低头看 Kennedy 不变（不抬头）
    - 整张脸**从中性逐渐转为愧疚痛苦**——这个变化必须可见为渐进过程
    - 同期 Sylvia 眼眶湿润度 50% → 70%、Kennedy 维持挑衅弧度

(e) 7-10s · Sylvia 颤抖追问 + 眼眶充满泪：
    - Sylvia 哽咽颤抖追问："What is the relationship between you and her?"（说到"between"声音短暂破一下、说到"and her"颤抖加重）
    - 同时 Sylvia 眼眶湿润度从 70% → 100%（**眼眶完全充满泪水但泪水还未溢出**、泪光在睫毛上悬着、视觉上明显含泪）
    - James 嘴角下撇程度加深、Kennedy 挑衅弧度维持

(f) 10-11s · James 倒吸一口气未答 + Sylvia 第一颗泪溢出：
    - James **嘴唇张开约 0.5 秒同时倒吸一口气**（胸口可见的吸气、嘴唇张开幅度可见、不发声）、张开后立刻闭合表情更愧疚痛苦
    - James 揽 Kennedy 的手臂潜意识紧一下
    - 同时 Sylvia **眼眶里的泪水开始从右眼眶溢出**——一颗泪珠从眼眶下沿挤出开始向下移动（**泪水的位置从眼眶里 → 眼角 → 脸颊上方**，移动是真实可见的动态过程）

(g) 11-12s · 一颗泪滑落脸颊：
    - Sylvia 那颗已经溢出的泪珠**沿脸颊缓慢向下滑落约 1 秒**——从眼角往下到颧骨再到脸颊中部，**泪痕轨迹清晰可见**（**模型必须演这一秒内的泪滑落动态、不是直接贴一道湿润痕迹**）
    - 嘴唇压抑地抖一下、眉头锁得更紧
    - 整张脸写满"等不到答案"的崩溃
    - 最后 0.5s 三人完全静止、镜头完全停止、画面保持"妻子崩溃落泪+丈夫愧疚跪抱+第三者挑衅胜利"三角构图直至视频结束

人物唯一性铁律：Sylvia 始终仅一人（@图2），James 始终仅一人（@图3），Kennedy 始终仅一人（@图4）。同一时刻画面中只有一个 Sylvia、一个 James、一个 Kennedy。严禁分身复制残影。

镜头：全程中景三人构图保持锚图视野，不推不移不摇——锚图站位完美，让三人状态变化自己说话。

关键场景：① 中景·视平线·静止不推移（全程 12s 锁定首帧锚图视野）。

音效（按情绪节拍分层）：0-2s 干燥层【公墓远处风声低 + Sylvia 强忍呼吸鼻音极轻】→ 2-4s Sylvia 哭腔叫名层【Sylvia 颤抖带哭腔叫 "Kennedy." 嘴唇颤动开合清晰 + 钢琴低音单音情绪坠入刺点】→ 4-5.5s Kennedy 嘴角勾起层【低音提琴拉一记低音 + 风过草地落叶声】→ 5.5-7s James 愧疚加深层【James 沉重呼吸鼻音 + 定音鼓极低频一次表"愧疚冲击"】→ 7-10s Sylvia 哽咽追问层【Sylvia 颤抖哽咽说话嘴唇开合清晰、说到 "between" 声音短暂破音、钢琴稀疏单音陪衬 + 大提琴低音持续延音】→ 10-11s James 倒吸气未答层【James 倒吸一口气清晰可闻吸气声 + 嘴唇张合极轻气流 + 大提琴音调微微上扬】→ 11-12s 泪落收尾层【Sylvia 一颗泪滑过脸颊的极致 ASMR 微响 + Sylvia 嘴唇压抑颤动极轻气声 + 大提琴单音长尾渐消至无】。对白【Sylvia 颤抖哽咽两句："Kennedy."（2-4s）+ "What is the relationship between you and her?"（7-10s）、英语口型精准同步且嘴唇明显颤抖、声音带哭腔颤抖有起伏、无字幕；James 与 Kennedy 全程不开口】。

禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、台词文字浮现、字幕条、对话框、弹幕、远景石碑文字被放大或聚焦（远景石碑保持模糊不可读）、画面中同时出现两个及以上 Sylvia/James/Kennedy、角色分身复制、Sylvia 说 "Kennedy." 和 "What is the relationship between you and her?" 以外任何台词、

**【v6 核心方法论强制约束 - 违反即失败】**：
- **Sylvia 眼睛全程保持干燥不变化**（必须从干燥渐变到泪水充满到一颗泪滑落 - 是动态过程）
- **Sylvia 整段没有泪水可见动态变化**（必须有清晰可见的"从无到有"过程）
- **Sylvia 没有泪从眼眶滑落脸颊的动作**（11-12s 必须有一颗泪可见地从眼眶滑过脸颊、不是静态贴上去的泪痕）
- **Kennedy 嘴角整段保持平直不变化**（必须从中性缓慢勾起到 15° 挑衅弧度的可见变化过程）
- **Kennedy 嘴角直接从首帧就是挑衅笑**（首帧是中性、必须演变化、不是把首帧贴每一帧）
- **James 表情整段保持中性不变化**（必须从中性低头逐渐演变为愧疚加深的可见过程）
- **James 没有倒吸气动作**（10-11s 必须有可见可闻的倒吸气）

其他禁止：
Sylvia 哭出声放声大哭（含泪是悬着、不是放声）、Sylvia 流泪后立即用手擦泪、Sylvia 走向 James、Sylvia 看镜头、Sylvia 嘴角上扬带笑意、James 站立起身（必须始终单膝跪姿）、James 松开 Kennedy（必须双臂始终揽抱）、James 的手伸向 Sylvia 或触碰孕肚（手只能在 Kennedy 身上）、James 直接抬头大幅看 Sylvia 不躲闪（本镜 James 头部维持低头看 Kennedy 方向不抬大头）、James 开口说话发出英文单词、Kennedy 站起来离开 James 怀抱、Kennedy 大幅抬头脱离 James 怀抱（只允许细微抬头）、Kennedy 表情悲伤求助痛苦、Kennedy 开口说话、三人空间关系改变、Sylvia 服装从黑色长裙变为其他、Sylvia 项链消失、首帧刚开始起手使用剧烈动词（冲向/猛推/跃起/瞬间/骤然）、画面中出现其他人物、阴云变晴天、公墓石碑位置漂移、远处教堂尖顶消失、Sylvia/James/Kennedy 服装颜色改变、头发长度改变、发型改变、最后 0.5s 任一角色继续可见动作、最后 0.5s 镜头继续运动、镜头任何方向的推移拉远摇摆升降跟拍、切入近景特写大特写、人物头部出画、人物面部被裁切、Sylvia 下半身被裁切、Sylvia 孕肚被完全遮挡、Kennedy 下半身被裁切、人物瞬移、镜头跳跃、空间关系改变、物理穿模、跳帧抽帧、Sylvia/James/Kennedy 分身复制。
