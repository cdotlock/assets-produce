---
shot_id: shot_10-3_v3
duration: 12s
mode: 首尾帧（首帧锚图承接 shot_9 末帧）
scene: 新月领地公墓
emotion_arc: 凝视沉默 → Sylvia 叫名 → Kennedy 抬头挑衅（头发拂脸） → James 吞咽转头 + 手压下巴 → Sylvia 追问 → James 嘴动未答 + 抓紧布料 → 呼吸级推进 → 三重静止
version: v3 粗粒度动作落地版（承认 Seedance 弱响应层：微表情/光影DNA/语气情绪；只保留强响应层：肢体大动作/头部角度/手部动作/视觉节奏停顿）
vs_v2_改动: |
  删除：光影 DNA 主基调段落（Seedance 继承首帧锚图，prompt 200 字光影描述无效）
  删除：所有 1mm 级微表情（颌骨咬紧/鼻翼微张/喉结滚动/瞳孔变化/眼神聚焦——中景均不可见）
  删除：所有"冷静到可怕/像在审判/像在陈述"的 TTS 语气词（TTS 合成为 flat 朗读，情绪词是元数据）

  替换表（弱响应 → 强响应）：
  - James 颌骨咬紧肌肉可见 → 伸左手用指关节轻压下巴边缘（手部动作）
  - James 喉结滚动一次 → 明显吞咽导致下颌微抬 1cm 后回落（头部动作替代喉结）
  - James 鼻翼微张 → 删除（完全不可见）
  - James 右手手指在布料上再扣紧 5mm → 五指明显抓拢 Kennedy 肩头大衣形成可见的抓握褶皱（幅度放大 5 倍）
  - Sylvia 眼神从涣散聚焦到 James → 头部下压约 2° 再抬起（头部动作替代眼神）
  - Sylvia 深呼吸一次 → 肩膀一次缓慢起伏（5cm 级可见动作）
  - Sylvia 下颌线微收紧 → 说话前 2s 沉默凝视（沉默即冷静、视觉节奏替代肌肉动作）
  - Kennedy 嘴角单侧微扬 5° → 嘴角单侧微扬 10° + 停留 2s（幅度加大 + 留时长）
  - Kennedy 眼圈泛红眼神挑衅 → 头发从 James 胸口缓慢抽离一缕拂过自己脸颊（动作替代眼部细节）

  保留 v2 成功部分：
  - 中景·视平线·静止不推移（0-9s）
  - 三人空间关系严格锁定
  - 两句英文对白（口型同步）
  - 9-10s barely perceptible slow push-in（v3 验证有效）
  - 三重静止收尾（E-9）
  - 人物唯一性铁律（防分身）
# ab_compare_with removed - v3 方向错（大动作替代微表情破坏剧情逻辑）；v4 接管对比主 shot
prev_ab_compare_with_v3_failed: shot_10-3, shot_10-3_v2
compare_note: 三版对照——v1 是 5234 字原版平铺；v2 尝试应用 DNA+微表情+语气情绪但落地失败（Seedance 弱响应层）；v3 承认 Seedance 能力边界，放弃光影DNA/微表情/语气，把所有情绪表达转为肢体大动作（手压下巴、吞咽抬下颌、肩膀起伏、头发拂脸、抓紧布料）和视觉节奏停顿（说话前 2s 凝视沉默）。预期 v3 的戏剧性来自肢体和沉默，不来自微肌肉和语气。
assets:
  images:
    - works/silver-moon-manor/episodes/ep_1/end-frames/shot_9_end.png
    - works/silver-moon-manor/assets/Sylvia人物立绘.png
    - works/silver-moon-manor/assets/char_james_portrait.png
    - works/silver-moon-manor/assets/costume_kennedy.png
  videos: []
---

韩漫画风，2D 动漫风格画风，9:16 竖屏尺寸，9:16 竖屏尺寸，9:16 竖屏尺寸。视觉风格硬约束（non-photorealistic stylization lock）：全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，非写实渲染 non-photorealistic rendering，无景深虚化 no depth-of-field blur，无真实皮肤质感 no realistic skin texture，简化五官 simplified cartoon facial features，Korean webtoon illustration style；所有人物脸部必须呈现明显动漫化简笔特征、严禁摄影质感/写实渲染/3D 渲染/真人相片外观。严格遵循参考图中场景的空间关系，禁止人物瞬移、镜头跳跃、空间关系改变和物理穿模。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无水印，纯画面叙事。@图1 作为首帧。

一段展现【孕妻用冷静的沉默打破僵局、叫 Kennedy 名字、追问关系、丈夫用吞咽与抓紧布料的肢体动作压抑愤怒却始终未开口】的 slow burn 对话博弈。本镜所有情绪表达全部通过肢体大动作和视觉节奏停顿实现——不依赖面部微表情、不依赖光影变化、不依赖 TTS 语气。

故事线（8 个节拍 · 肢体动作驱动）：
(a) 0-2s 凝视沉默（Sylvia 先不说话，用沉默建立冷静）
(b) 2-3.5s Sylvia 肩膀一次缓慢起伏 + 头部微下压再抬起 + 说 "Kennedy."
(c) 3.5-4.5s Kennedy 抬头 60° + 嘴角单侧微扬 10° + 头发从 James 胸口抽离一缕拂过自己脸颊
(d) 4.5-6s James 明显吞咽一次（下颌微抬 1cm 后回落）+ 头部转向 Sylvia 约 20°
(e) 6-9s Sylvia 说 "What is the relationship between you and her?"（头部保持不动）
(f) 9-10s James 嘴唇明显开合一次（约 1 秒张合幅度可见）+ 右手五指明显抓拢 Kennedy 肩头大衣形成可见抓握褶皱 + 镜头 barely perceptible slow push-in（中景微推至中近景，推进幅度 5%）
(g) 10-12s 三重静止收尾

人物唯一性铁律：本分镜全程画面中 Sylvia 始终仅为一人（@图2 为立绘参考），James 始终仅为一人（@图3 为立绘参考），Kennedy 始终仅为一人（@图4 为立绘参考）。同一时刻画面中只有一个 Sylvia、一个 James、一个 Kennedy。严禁角色分身、复制、残影同位并存。

场景连续性：@图1 首帧锚图承接 shot_9 末帧。全程户外公墓。严禁出现厨房/室内/车辆元素。

关键场景：
① 中景·视平线·静止不推移（0-9s）+ barely perceptible slow push-in（9-10s）+ 完全静止（10-12s）。

【0-2s · 凝视沉默（用沉默建立冷静）】画面构图完全承接 @图1 首帧——画面左 @图2 Sylvia（中景·侧身 3/4 面向画面右、右手护腹、左手垂放身侧、嘴唇闭合、头部朝向 James 方向）；画面中偏右 @图3 James（单膝跪姿、双臂收紧揽抱 Kennedy、嘴唇紧闭、头部朝向 Kennedy 肩头）；画面右偏下 @图4 Kennedy（脸埋 James 胸口、双臂环抱 James 腰际、头发散落遮挡一半脸）。三人完全静止 2 秒——**Sylvia 不说话、不动、只凝视**；这 2 秒的**沉默本身就是冷静决意的表达**。环境中远处针叶林微风、阴云低压、落叶地面全部静止。

【2-3.5s · Sylvia 打破僵局（肩膀+头部+开口三段式）】@图2 Sylvia **肩膀做一次缓慢起伏**（约 1 秒、可见的 5cm 级肩部动作，代替"深呼吸"），**同时头部微微向下压约 2°**（0.4 秒）然后**抬起回到原位**（0.4 秒）——这个"点头式"的头部动作**代替眼神从涣散聚焦**（头部动作可见、眼神变化不可见）。动作完成后 @图2 Sylvia（中景·视平线·侧身 3/4，英语口型同步 word-level lip-sync，native English pronunciation，音量稳定清晰，无字幕）平稳地说：\"Kennedy.\"——单音节嘴唇清晰开合、说完嘴唇立刻闭合、头部维持抬起后的位置不动。**头部在说完台词后保持静止不再动**——这是冷静的可见信号。

【3.5-4.5s · Kennedy 挑衅（抬头+嘴角+头发三段式大动作）】@图4 Kennedy **头部从埋在 James 胸口的位置缓慢抬起约 60 度完全面向 Sylvia**（抬头动作约 0.6 秒，可见的大幅度动作）、**嘴角单侧（右侧）向上微扬约 10 度形成不对称挑衅弧度**（幅度可见、停留至本节拍结束），**同时一缕散落在 James 胸口的头发从 James 大衣前襟缓慢抽离拂过自己的左脸颊**（头发拂脸是 10cm 级可见动作，代替"眼圈泛红+眼神挑衅"这种不可见的眼部细节）。**Kennedy 抬头后头部保持 60° 不动、嘴唇紧闭、不再做其他动作**。同期 @图3 James 维持跪姿揽抱不变、@图2 Sylvia 维持凝视姿态不动。

【4.5-6s · James 被迫面对（吞咽+转头+手压下巴）】@图3 James **做一个明显的吞咽动作导致下颌向上微抬约 1cm 后回落**（可见的头部动作，代替"喉结滚动"），**随后头部缓慢从锁定 Kennedy 肩头的位置转向画面左侧 Sylvia 方向约 20 度**（颈部转动约 1 秒），**目光落在 Sylvia 脸上锁定**。转头完成后 @图3 James **抬起左手用食指关节轻压在自己的下巴左边缘**（约 0.5 秒停留，手部动作代替"颌骨咬紧"——用可见的手势外化压抑的愤怒）、**嘴唇紧闭不开口**。同期 @图4 Kennedy 维持抬头挑衅凝视 Sylvia 不动、@图2 Sylvia 保持凝视姿态不动。

【6-9s · Sylvia 追问（头部静止+稳定说出）】@图2 Sylvia（中景·视平线·侧身 3/4，英语口型同步 word-level lip-sync，native English pronunciation，音量稳定不起伏，无字幕）平稳地说：\"What is the relationship between you and her?\"——6-6.4s 说 \"What is\"、6.4-6.8s 说 \"the relationship\"、6.8-7.2s 说 \"between\"、7.2-7.5s 说 \"you\"、7.5-7.8s 说 \"and her\"、共 1.8s 说完九个单词、口型精准同步。说话全程 @图2 Sylvia **头部完全不动、身体完全不动、右手护腹不动**——身体的静态即表达冷静（视觉节奏替代语气）。同期 @图3 James **左手仍压在下巴边缘不动**、**头部保持转向 Sylvia 位置不动**；@图4 Kennedy **头部保持 60° 抬头位置不动**、**嘴角单侧扬起的挑衅弧度保持不变**。

【9-10s · James 未答（嘴动+抓布料+呼吸级推进）】@图3 James **左手从下巴边缘缓慢放下回到身侧**（约 0.5 秒），**嘴唇明显开合一次约 1 秒张合幅度清晰可见**（动作幅度加大至嘴唇可见张开约 0.5cm、不发声不产生单词口型）、**说完嘴唇立刻重新紧闭**；**同步右手原本揽在 Kennedy 背部的五指明显抓拢一次**——五指向内收拢约 1 秒、**在 Kennedy 肩头大衣形成一道可见的深抓握褶皱**（幅度加大 5 倍至可见级别、替代 v2 的"手指微收紧"）。**镜头在这 1 秒内发生一次 barely perceptible slow push-in 从中景极轻微推进至中近景（推进幅度约 5% 观众不能明显察觉只感觉空气被抽近变得窒息）**。同期 @图2 Sylvia **维持凝视不动**、@图4 Kennedy **一阵微风吹过散落的头发再次轻轻拂动约 0.5 秒后回落**、挑衅凝视不变。

【10-12s · 三重静止收尾】最后 2 秒三重静止：(1) 镜头完全停止移动不再 push-in，(2) 三人主体动作全部完全停止——@图2 Sylvia（右手护腹不动、左手垂放不动、头部保持凝视 James 不动、嘴唇闭合）；@图3 James（左手落回身侧不动、嘴唇紧闭、双臂揽 Kennedy 不变、右手保持抓拢 Kennedy 肩头的深褶皱状态不再收也不松）；@图4 Kennedy（抬头 60° 维持、嘴角单侧扬起的挑衅弧度维持、嘴唇紧闭、头发回落不再飘动），(3) 画面保持"追问未答三角凝视"静态构图直至视频结束——背景新坟、远处针叶林、阴云天空、落叶地面全部静止、风完全停。

音效（按肢体动作节拍分层）：0-2s 凝视层【远处风声低持续 + 阴云天空下空气沉闷感低 + 完全的环境静音让沉默更重】→ 2-3.5s Sylvia 开口层【肩膀起伏时布料摩擦极轻 + 头部微动颈部极轻响 + Sylvia 说 "Kennedy." 嘴唇开合清晰 + 钢琴极低音单音一次作为"接住了"刺点】→ 3.5-4.5s Kennedy 抬头层【Kennedy 头部抬起时头发从 James 大衣前襟滑过的清晰布料摩擦 + 头发拂脸的极轻飘动声 + 低音提琴拉一记低音作为对峙升级刺点】→ 4.5-6s James 吞咽转头层【明显可闻的吞咽气流声 + James 颈部转动时布料极轻摩擦 + James 左手抬起压在下巴时衣料摩擦声 + 定音鼓极低频一次作为"被迫面对"重拍】→ 6-9s Sylvia 追问层【Sylvia 说话嘴唇开合清晰 + 钢琴稀疏单音陪衬每个词的停顿 + 环境音持续降低配合台词清晰度】→ 9-10s 沉默+推进层【James 左手放下时布料摩擦极轻 + 嘴唇张合一次的极轻气流声 + 右手抓拢 Kennedy 肩头大衣时布料压缩声（清晰可闻）+ 风过 Kennedy 发丝的极轻飘动 + 大提琴音调微微上扬一分 + push-in 配合低频嗡鸣渐起表现空气窒息感】→ 10-12s 余震层【所有乐器渐弱至极低持续音 + 风完全停 + 仅余大提琴单音长尾渐消至无 + 无打击乐】。对白【Sylvia 平稳两句：\"Kennedy.\"（2.5-3.5s）+ \"What is the relationship between you and her?\"（6-8s）、英语口型精准同步、无字幕；James 与 Kennedy 全程不开口】。

禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、台词文字浮现、字幕条、对话框、弹幕、画面中同时出现两个及以上 Sylvia / James / Kennedy、角色分身、角色复制、Sylvia 说 "Kennedy." 和 "What is the relationship between you and her?" 以外任何台词、James 开口说话、James 嘴唇同步任何英文单词发音（本镜 James 只允许嘴唇开合一次不发音）、James 说 "Not now, Sylvia." 或其他台词、Kennedy 开口说话、Kennedy 抬头后又埋回（必须保持挑衅凝视 10s 不埋回）、Kennedy 眼神悲伤或求助（必须挑衅嘴角单侧扬起）、Sylvia 哭出声、Sylvia 流泪、Sylvia 走向 James、Sylvia 扶腹奔跑、Sylvia 伸手抓 James、Sylvia 咆哮、Sylvia 看镜头、Sylvia 嘴角上扬带笑意、Sylvia 眉毛上挑、James 目光仍落在 Kennedy 肩头不转（必须转头看 Sylvia）、James 松开双臂、James 放下 Kennedy、James 站起来、James 离开新坟、James 看镜头、James 对 Sylvia 微笑、James 左手没有抬起压下巴（这个动作必须生成——是本镜 James 情绪外化的关键可见动作）、James 没有吞咽动作（必须有明显吞咽导致下颌微抬 1cm）、James 右手没有抓拢 Kennedy 肩头形成深褶皱（必须有可见的抓握褶皱）、Kennedy 头发没有拂过脸颊（必须有发丝从 James 胸口抽离的动作）、Kennedy 嘴角单侧上扬幅度不足 10°（必须是可见的不对称弧度）、Sylvia 肩膀没有起伏（必须有可见的肩部动作）、Sylvia 头部没有微下压再抬起（必须有可见的点头式动作）、Sylvia 开场立即说话（必须先 2 秒凝视沉默）、9-10s push-in 推进幅度过大（必须是 barely perceptible 5%）、0-9s 期间镜头发生推移（仅 9-10s 允许）、10-12s 镜头继续推进（必须完全停止）、首帧刚开始起手使用剧烈动词（冲向/猛推/跃起/瞬间/骤然）、画面中出现其他人物、画面中出现车辆、画面中出现厨房元素、阴云变晴天、公墓石碑位置漂移、新坟消失、背景针叶林消失、Sylvia/James/Kennedy 服装颜色改变、左手腕银手链消失、头发长度改变、发型改变、最后 2s 任一角色继续可见动作、最后 2s Kennedy 埋回 James 胸口、最后 2s James 目光转移或开口、最后 2s Sylvia 再次说话、最后 2s 镜头继续运动、主体动作延续到视频结束、镜头除 9-10s 呼吸级推进外的任何推移拉远摇摆升降跟拍、切入近景特写大特写（除 9-10s 微推至中近景）、人物头部出画、人物面部被裁切、Sylvia 下半身被裁切、Sylvia 孕肚被完全遮挡、人物瞬移、镜头跳跃、空间关系改变、物理穿模、跳帧抽帧、Sylvia 分身复制、James 分身复制、Kennedy 分身复制。
