---
shot_id: shot_10-3_v5
duration: 12s
mode: 首尾帧（首帧锚图——人工图生图重做的正确站位锚图，替代之前的 shot_9_end.png）
scene: 新月领地公墓
emotion_arc: Sylvia 含泪嘴抖 → 颤抖哽咽叫名 → Kennedy 主动挑衅得意 → James 愧疚不敢直视 → Sylvia 哭腔追问声音破一下 → James 倒吸一口气未答 → Sylvia 一颗泪滑落
version: v5 锚图根治版（用图生图重做的正确站位首帧 + v4 短剧情绪外显 prompt + 标准版模型三重叠加）
vs_v4_root_fix: |
  v4 fast 和 v4_pro 的失败根因是首帧锚图 shot_9_end.png 本身站位崩坏：
  - James 站立不是跪姿
  - James 的手放在 Sylvia 孕肚上（剧情逻辑严重错位）
  - Kennedy 半身被裁切
  - 三人挤在一起空间关系丢失
  无论 prompt 怎么写、用 fast 还是标准版模型——首尾帧严格继承首帧像素，全部白搭。

  v5 唯一的根治：换掉首帧锚图。
  - 新锚图 works/silver-moon-manor/ref-frames/ep_1/shot_10-3_anchor.jpg 由用户在即梦图生图重做
  - 三人站位完全正确：James 单膝跪在草地上 + Kennedy 完整侧坐入画在 James 怀中 + Sylvia 站在三米外
  - James 的手只接触 Kennedy 不碰 Sylvia
  - Sylvia 含泪嘴抖、Kennedy 嘴角勾起挑衅、James 低头愧疚——首帧已经定调
  - 公墓背景齐全：石碑、新坟、教堂尖顶、阴云、针叶林

  prompt 内容沿用 v4 的"短剧情绪外显 + 反 Seedance 衰减反向校准"路线（v4 验证有效）。
  模型升级为标准版 dreamina-seedance-2-0-260128（站位正确后画质优势能真正发挥）。

# ab_compare_with moved to shot_10-3_v6 (六版对比由 v6 持有)
prev_compare_note: v5 锚图修正了站位但 Sylvia 已含泪导致眼泪不动——动态属性必须在锚图留白
compare_note: 五版对照——v1 平铺；v2 工程化堆砌情绪没落地；v4 短剧式情绪外显但首帧锚图错导致站位崩；v4_pro 仅升级到标准版模型站位仍崩证明非模型问题；v5 = 重做正确站位锚图 + v4 短剧 prompt + 标准版模型三重叠加。重点对比：v5 是否同时解决了"画质糊"和"站位崩"两个问题。
assets:
  images:
    - works/silver-moon-manor/ref-frames/ep_1/shot_10-3_anchor.jpg
    - works/silver-moon-manor/assets/Sylvia人物立绘.png
    - works/silver-moon-manor/assets/char_james_portrait.png
    - works/silver-moon-manor/assets/costume_kennedy.png
  videos: []
---

韩漫画风，2D 动漫风格画风，9:16 竖屏尺寸，9:16 竖屏尺寸，9:16 竖屏尺寸。视觉风格硬约束（non-photorealistic stylization lock）：全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，非写实渲染 non-photorealistic rendering，简化五官 simplified cartoon facial features but with clearly visible emotional expressions（动漫大眼平涂但情绪表达必须强烈可见——含泪、嘴唇颤抖、嘴角下撇、眉头紧锁等可见可读）；Korean webtoon illustration style；所有人物脸部必须呈现明显动漫化简笔特征但情绪外显丰富立体；严禁摄影质感/写实渲染/3D 渲染/真人相片外观；严禁面部表情冷静麻木无情绪。严格遵循参考图中场景的空间关系，禁止人物瞬移、镜头跳跃、空间关系改变和物理穿模。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无水印（注：@图1 锚图中可能可见的远处石碑文字属于场景元素的合理存在不算字幕，但禁止生成新的字幕文字浮现），纯画面叙事。@图1 作为首帧。

**首帧空间关系严格继承（关键）**：@图1 锚图已经精确定义了三人空间关系——画面左侧 Sylvia 独立站立、画面右下方 James 单膝跪在草地上揽抱身旁的 Kennedy、Kennedy 侧坐入画完整、Sylvia 与 James/Kennedy 之间隔着 2-3 米土路和墓地无任何接触。本镜整段 12s 必须严格保持此空间关系：Sylvia 始终站立在画面左侧不向右移动、James 始终单膝跪姿不站起来、Kennedy 始终侧坐 James 怀中不站起来、三人之间始终保持 2-3 米距离不靠近、Sylvia 始终独立不与 James/Kennedy 接触、James 的双臂始终只揽抱 Kennedy 严禁伸向 Sylvia 或触碰 Sylvia 的孕肚。

一段展现【七个月孕妇 Sylvia 在公墓发现丈夫 James 跪抱另一个女人 Kennedy 后情绪崩溃质问、声音颤抖含泪带哭腔、丈夫愧疚不敢直视、第三女得意挑衅、最后一颗泪滑落】的互动短剧戏剧段。本镜全程情绪外显丰富立体——Sylvia 的崩溃直接可见可读、James 的愧疚痛苦写在脸上、Kennedy 的挑衅胜利毫不掩饰。**禁止内敛克制的电影艺术片语言**——必须按互动短剧语言：情绪外露、人物鲜活、观众秒懂。

【Seedance 衰减反向校准声明】本 prompt 所有情绪描述均按"过分激烈"程度撰写——是为了对抗 Seedance 对情绪表达的衰减、让最终画面落到"刚好合适的强度"。模型不得衰减以下情绪信号到看不见的程度：Sylvia 必须明显含泪、嘴唇必须可见颤抖、声音必须带哭腔哽咽、最后必须有一颗可见的泪滑落；James 必须低头不敢直视、嘴角必须明显下撇、转头时必须有眼神闪躲的可见动作；Kennedy 必须有可见的挑衅嘴角上扬。

故事线（7 个节拍 · 情绪外显驱动 · 严格保持首帧空间关系）：
(a) 0-2s 承接首帧 + Sylvia 嘴唇微颤一下 + 眼眶含泪
(b) 2-4s Sylvia 颤抖压低带哭腔几乎从喉咙挤出地叫："Kennedy."
(c) 4-5.5s Kennedy 头部缓缓略微抬起一些 + 眼睛微眯 + 嘴角单侧明显勾起（挑衅得意写在脸上）
(d) 5.5-7s James 听到 + 身体明显震一下 + 头部从低着的位置勉强抬起 + 不敢直视 Sylvia 立刻闪开目光
(e) 7-10s Sylvia 声音不稳带颤抖追问："What is the relationship between you and her?"（说到"between"声音短暂破一下、说到"and her"眼眶里泪悬而欲落）
(f) 10-11s James 嘴唇张开倒吸一口气又立刻闭上 + 表情更愧疚痛苦 + 揽 Kennedy 的手臂潜意识紧一下（手只在 Kennedy 身上不动到 Sylvia）
(g) 11-12s Sylvia 一颗泪从眼眶缓缓滑落脸颊 + 嘴唇压抑抖一下 + 表情维持崩溃边缘静止收尾

人物唯一性铁律：Sylvia 始终仅一人（@图2），James 始终仅一人（@图3），Kennedy 始终仅一人（@图4）。同一时刻画面中只有一个 Sylvia、一个 James、一个 Kennedy。严禁分身复制残影。

镜头：全程中景三人构图保持锚图视野，不推不移不摇——这次锚图站位已经完美，让三人表演自己说话。

关键场景：① 中景·视平线·静止不推移（全程 12s 锁定首帧锚图视野，不推近不拉远不平移）。

【0-2s · 承接首帧 · 含泪嘴抖】画面构图严格承接 @图1 首帧锚图——画面左 @图2 Sylvia（站立、孕肚正面、双手覆腹、深色针织上衣、含泪嘴抖、独立站立不向右移动）；画面右下方 @图3 James（单膝跪在草地上、深色羊绒大衣、双臂揽抱 Kennedy、低头愧疚、不站起来）；@图3 James 怀中 @图4 Kennedy（侧坐草地、双腿入画、黑色风衣、面向 Sylvia 方向、嘴角已勾起挑衅）。0-2s 三人位置完全静止，**Sylvia 嘴唇微微颤抖一下后抿紧、眉头锁紧**、**眼眶里的泪光更明显一分**。

【2-4s · Sylvia 颤抖叫名】@图2 Sylvia **胸口起伏一次明显可见**（强忍住的呼吸）、**双手在腹部上的力度增加形成可见衣料褶皱**、**嘴唇再颤一下**。然后 @图2 Sylvia（中景·视平线·画面左侧站立，英语口型同步 word-level lip-sync，native English pronunciation，**声音颤抖压低带明显哭腔哽咽、像是从喉咙里挤出来、字音不稳颤动一下、音量低但情绪饱满**，无字幕）颤抖地几乎哽咽地说：\"Kennedy.\"——单音节嘴唇颤抖开合、说出时嘴唇明显抖动、说完嘴唇立刻紧闭压抑、**眼眶里的泪再涨一分**、**眉头锁得更紧**。Sylvia 全程**站立不动**位置不变。

【4-5.5s · Kennedy 主动挑衅得意】@图4 Kennedy **头部从靠在 James 怀中的位置缓慢略微抬起一些更面向 Sylvia 方向**（不是大幅抬头是细微的抬头确认动作、保持侧坐姿态不动）、**眼睛微微眯起一下带胜利感**、**嘴角单侧（朝向 Sylvia 那一侧）已勾起的挑衅弧度更明显一分**（明显可见的挑衅笑、不是隐晦微扬）、**眼神锋利不带泪不带悲伤**——**胜利感写在脸上**。Kennedy 嘴唇紧闭不开口、表情维持挑衅得意凝视 Sylvia 不变直至本节拍结束。**Kennedy 始终在 James 怀中侧坐不站起来不离开**。

【5.5-7s · James 愧疚震动】@图3 James **听到 "Kennedy." 后身体明显震一下**（肩膀和上半身可见的颤动一次约 0.4 秒、跪姿保持不变）、**头部从低着的位置缓慢抬起**——**先看 Sylvia 脚边再勉强抬到她的肩膀位置再勉强抬到她脸上又立刻闪开目光低下**（眼神闪躲明显可见、不是"目光锁定"）、**眉头锁得更紧**、**嘴角向下撇得更明显**、**整张脸写满愧疚痛苦**。**James 始终单膝跪姿不站起来**、**双臂始终只揽抱 Kennedy 不松开不碰 Sylvia**。Kennedy 维持挑衅凝视。Sylvia 维持含泪嘴抖姿态站立。

【7-10s · Sylvia 哽咽追问 · 声音破一下】@图2 Sylvia（中景·视平线·画面左侧站立不动，英语口型同步 word-level lip-sync，native English pronunciation，**声音不稳带明显颤抖和哭腔、音量从低到高有起伏不是平稳、说到"between"时声音短暂破一下像憋不住情绪、说到"and her"时声音再颤一下泪悬而欲落**，无字幕）哽咽颤抖追问：\"What is the relationship between you and her?\"——7-7.4s 说 \"What is\"（声音颤抖低）、7.4-7.8s 说 \"the relationship\"（声音稍稳）、7.8-8.2s 说 \"between\"（**说到这里声音短暂破一下、明显的情绪起伏**）、8.2-8.5s 说 \"you\"（声音再低）、8.5-8.8s 说 \"and her\"（**说到这两个词时眼眶的泪再涨一分悬在睫毛上欲落不落**）。说话全程 @图2 Sylvia **嘴唇明显颤动开合、眉头深锁、含泪眼睛湿润可见、表情写满崩溃边缘的痛苦**。同期 @图3 James **低着头表情更加痛苦愧疚**（跪姿保持）、@图4 Kennedy **维持挑衅凝视**（侧坐保持）。

【10-11s · James 倒吸口气未答】@图3 James **嘴唇张开约 0.5 秒同时倒吸一口气**（**胸口可见的吸气动作 + 嘴唇张开幅度可见 + 不发声不产生英文单词口型**）、**张开后立刻闭合表情更痛苦**、**眉头深锁嘴角下撇**、**揽 Kennedy 的右手潜意识地再扣紧一下**（五指在 Kennedy 肩头风衣上向内扣形成可见褶皱、动作只在 Kennedy 身上不延伸到 Sylvia）。Sylvia 维持含泪嘴抖凝视 James 站立、Kennedy 维持挑衅。

【11-12s · 一颗泪滑落 · 崩溃外显收尾】@图2 Sylvia **眼眶里悬而欲落的那颗泪缓慢滑落脸颊约 1 秒**（**清晰可见的泪痕从下眼睑划过脸颊**、动作清晰可读、是本镜情绪外显的最终表达）、**嘴唇压抑地抖一下**（嘴唇可见的颤动一次）、**眉头锁得更紧**、**整张脸写满"等不到答案"的崩溃**。最后 1s 三重静止：(1) 镜头完全停止移动（其实全程没动，明确收尾不动），(2) 三人主体静止——Sylvia（泪痕已滑过脸颊、嘴唇紧闭压抑颤抖凝固、站立姿势不变）；James（嘴唇紧闭低头愧疚、单膝跪姿不变、双臂揽 Kennedy 不变）；Kennedy（侧坐 James 怀中、嘴角勾起的挑衅胜利弧度维持、眼神锋利），(3) 画面保持"妻子崩溃落泪+丈夫愧疚跪抱+第三者挑衅胜利"三角构图直至视频结束。

音效（按情绪外显节拍分层）：0-2s 含泪层【公墓远处风声低 + 阴云空气沉闷感 + Sylvia 强忍呼吸的鼻音极轻清晰可闻】→ 2-4s Sylvia 哭腔叫名层【**Sylvia 颤抖压低的哭腔气声叫 "Kennedy."嘴唇颤动开合清晰** + 钢琴低音单音作为情绪坠入刺点 + 一阵风吹动落叶】→ 4-5.5s Kennedy 挑衅层【低音提琴拉一记低音作为对峙升级 + Kennedy 头部细微动作的极轻颈部声】→ 5.5-7s James 震动愧疚层【**James 身体震动时衣料摩擦 + 颈部转动的极轻关节声** + 定音鼓极低频一次作为"愧疚冲击"重拍 + James 沉重呼吸的鼻音可闻】→ 7-10s Sylvia 哽咽追问层【**Sylvia 颤抖哽咽说话的嘴唇开合清晰、说到 "between" 声音短暂破音可闻、说到 "and her" 眼眶含泪的极轻吸气声** + 钢琴稀疏单音陪衬 + 大提琴低音持续延音表现悲伤】→ 10-11s James 倒吸气未答层【**James 倒吸一口气的清晰可闻吸气声 + 嘴唇张合的极轻气流** + 右手抓拢 Kennedy 风衣布料的清晰压缩声 + 大提琴音调微微上扬】→ 11-12s 泪落收尾层【**Sylvia 一颗泪滑过脸颊的极致 ASMR 微响（cinematic teardrop）+ Sylvia 嘴唇压抑颤动的极轻气声** + 大提琴单音长尾渐消至无 + 风停 + 公墓死寂表现崩溃凝固】。对白【Sylvia 颤抖哽咽两句：\"Kennedy.\"（2-4s）+ \"What is the relationship between you and her?\"（7-10s）、英语口型精准同步且嘴唇明显颤抖、声音带哭腔颤抖有起伏、无字幕；James 与 Kennedy 全程不开口】。

禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、台词文字浮现、字幕条、对话框、弹幕（注：@图1 锚图远处石碑可见的英文姓名属于场景元素合理存在、不算字幕、不要求模型遮蔽或修改）、画面中同时出现两个及以上 Sylvia / James / Kennedy、角色分身、角色复制、Sylvia 说 "Kennedy." 和 "What is the relationship between you and her?" 以外任何台词、Sylvia 表情冷静无波动平静麻木（**本镜 Sylvia 必须明显崩溃含泪嘴抖**）、Sylvia 平稳无起伏一字一顿无情绪地说话（**本镜 Sylvia 台词必须颤抖带哭腔有重音起伏**）、Sylvia 眼睛干燥无泪光（**必须明显含泪眼眶湿润**）、Sylvia 嘴唇没有颤动（**必须可见嘴唇颤动**）、Sylvia 眉头平展没有锁紧、Sylvia 最后没有泪滑落（**11-12s 必须有一颗清晰可见的泪从眼眶滑过脸颊**）、Sylvia 哭出声放声大哭、Sylvia 流泪后立即用手擦泪、**Sylvia 向右移动靠近 James 或 Kennedy（必须始终站立画面左侧不动）**、**Sylvia 走向 James / 弯腰 / 蹲下**、Sylvia 伸手抓 James、Sylvia 咆哮、Sylvia 看镜头、Sylvia 嘴角上扬带笑意、**James 站立起身（必须始终单膝跪姿不站起来）**、**James 松开 Kennedy（必须双臂始终揽抱 Kennedy）**、**James 的手伸向 Sylvia 或触碰 Sylvia 的孕肚（手只能在 Kennedy 身上）**、James 直视 Sylvia 不躲闪（**本镜 James 必须低头不敢直视、转头时眼神立刻闪开**）、James 表情冷静无愧疚、James 开口说话、James 嘴唇同步任何英文单词发音、James 没有倒吸气动作（**10-11s 必须有可见可闻的倒吸气**）、James 没有身体震动（**5.5-7s 必须有可见的身体颤动一次**）、**Kennedy 站起来离开 James 怀抱（必须始终侧坐 James 怀中）**、**Kennedy 大幅抬头脱离 James 怀抱（只允许细微抬头确认动作）**、Kennedy 表情悲伤求助痛苦（**必须挑衅胜利得意**）、Kennedy 眼角下垂带哭意（**必须眼睛微眯锋利胜利感**）、Kennedy 嘴角没有勾起（**必须有清晰可见的单侧嘴角勾起 15° 左右**）、Kennedy 开口说话、Kennedy 挣脱 James 怀抱、**三人空间关系改变（必须严格保持 Sylvia 左侧站立 + James 跪姿右下 + Kennedy 怀中侧坐 + 三人不接触）**、使用"克制/压抑/平稳/陈述/无起伏/沉默如冰/冷静到可怕"等内敛文艺片语言描述演技、首帧刚开始起手使用剧烈动词（冲向/猛推/跃起/瞬间/骤然）、画面中出现其他人物、阴云变晴天、公墓石碑位置漂移、新坟消失、背景针叶林消失、教堂尖顶消失、Sylvia/James/Kennedy 服装颜色改变、左手腕银手链消失、头发长度改变、发型改变、最后 1s 任一角色继续可见动作、最后 1s Kennedy 离开 James 怀抱、最后 1s James 站起来、最后 1s Sylvia 走向 James、最后 1s 镜头继续运动、镜头任何方向的推移拉远摇摆升降跟拍切入近景特写大特写、人物头部出画、人物面部被裁切、Sylvia 下半身被裁切、Sylvia 孕肚被完全遮挡、Kennedy 下半身被裁切（**锚图 Kennedy 双腿入画完整本镜必须保持**）、人物瞬移、镜头跳跃、空间关系改变、物理穿模、跳帧抽帧、Sylvia 分身复制、James 分身复制、Kennedy 分身复制。
