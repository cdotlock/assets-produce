**⚠️ 本文档仅作为九段式 prompt 的格式参考。文中的素材路径已更新为 works/ 约定。格式结构为权威参考，具体路径以 SKILL.md 为准。**

**🚨 重要：本模板已更新，删除所有服装描述，符合最新规则（2026-05-05）：**
- ✅ 使用"角色主参考约束句"：`@图N 角色名 角色主参考（画面中 X 的外貌、五官、发型、服装、身材、孕肚与配饰全部严格以 @图N 为准，禁止偏离；不得添加参考图外的服装或配件）`
- ❌ 禁止描述服装细节：不要写"深色针织毛衣"、"米白色阔腿裤"等
- ❌ 禁止描述配饰细节：不要写"细银手链"、"金项链"等
- ❌ 禁止描述发型细节：不要写"头发扎起"、"长发散落"等
- 详见 `视频提示词标准规则.md` 和 `SKILL.md` 第277-280行

# EP2 完整提示词原文 — 五镜横排对照

> 由 `EP2_完整提示词对照.xlsx` 转换而来。原表横向五镜（Shot 1–5）× 纵向九段提示词组件。本 MD 改为「每镜一节」结构，便于整段复制使用。

## 目录

- [Shot 1 · 公墓对峙离开（12s · L3）](#shot-1)
- [Shot 2 · 客厅Alpha命令（12s · L2）](#shot-2)
- [Shot 3 · 客厅势力登场（12s · L3）](#shot-3)
- [Shot 4 · 真相宣判（12s · L3）](#shot-4)
- [Shot 5 · 两人无声盟约（10s · L2）](#shot-5)

<a id="shot-1"></a>
## Shot 1 · 公墓对峙离开
**12s · L3**

### YAML 元数据
```yaml
shot_id: shot_1
duration: 12s
mode: L3 首尾帧双锚 + 三层 reference
scene: 新月领地公墓
shot_function: Sylvia在公墓逼问James给一个答案——问题没有得到，她以转身离开代替崩溃，展示意志而非软弱
prev_shot_recap: Sylvia站在公墓正面等着James，James视线滑开落在Kennedy肩头，双臂未松，Kennedy哭声填满沉默
next_shot_setup: Sylvia转身往停车场走，James叫她却没有追；下一场移至银月领地豪宅客厅，James关上门后Alpha命令开始
emotion_arc: 僵局沉默（Sylvia在等）→ 逼问一字一顿 → Kennedy挑衅 → Sylvia转身离开（沉默是她的答案）
assets:
  images:
    - works/silver-moon-manor/assets/scene_cemetery.png
    - works/silver-moon-manor/assets/Sylvia人物立绘.png
    - works/silver-moon-manor/assets/char_james_portrait.png
    - works/silver-moon-manor/assets/costume_kennedy.png
  videos: []
```

### ① 版权 + 风格声明
全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，非写实渲染，简化五官，Korean webtoon illustration style；严禁摄影质感/写实渲染/3D 渲染/真人相片外观。9:16 竖屏。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无水印，纯画面叙事。

### ② 人物唯一性铁律
画面中 Sylvia 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 James 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 Kennedy 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。

### ③ @图N 说明 + 空间关系
@图1 为新月领地公墓场景图（空间层：石碑区域、新坟位置、出口方向）；@图2 为 Sylvia 角色 DNA（锁定面部、发型、身材、孕肚、服装、配饰）；@图3 为 James 角色 DNA（锁定面部、发型、身材、服装）；@图4 为 Kennedy 角色 DNA（锁定面部、发型、身材、服装）。

### ④ 核心叙事总纲
三人空间关系延续上镜：Sylvia 前景中央（背向出口方向）→ James 中景（仍跪地揽着 Kennedy）→ Kennedy 依偎 James 旁侧。摄像机继续在轴线左侧，与上镜保持一致，不越轴。

### ⑤ 关键场景时间轴（故事线）
一段展现公墓对峙收尾的片段，9:16 竖屏，情绪从压抑的等待到主动转身离开，以Sylvia的行动代替崩溃。故事线：Sylvia 手指在腹部收紧再松开（逼出一字一顿的逼问）→ Kennedy 挑衅地从 James 怀里抬起头看向 Sylvia → James 没有开口没有动 → Sylvia 转身往停车场走 → James 叫她名字 → 她没有停。

### ⑥ 关键场景分镜
关键场景：① 中景·平视·静止，承接上镜三角构图，0-3s @图2 Sylvia（中景·视平线·正面）手指在腹部缓缓收紧再松开，随即开口，英语对白 word-level lip-sync："I need an answer, James."（一字一顿·声音极平·每字落地），3-5s @图3 James 下颌绷紧没有开口也没有松手；@图4 Kennedy 从 James 怀中慢慢抬起头，挑衅地看向 Sylvia，嘴角有一点弧度，5-7s 画面切到过肩反打（镜头越过 James 左肩，朝向 Sylvia 面部，角度偏移≥30度），Sylvia 看了两人三秒，目光从 James 脸到 Kennedy 脸平静扫过，没有崩溃，7-9s Sylvia 转身，背对 James，步伐稳定，朝停车场方向走出，9-11s James 站起来，英语对白 word-level lip-sync："Sylvia. Stop."（低·急·两字·像命令），Sylvia 没有停，没有回头，脚步稳不快，一步一步走离，11-12s 画面定格 Sylvia 的背影，越走越远，公墓冷灰石碑在她两侧。最后 2s 三重静止：镜头完全停止移动 + Sylvia 背影保持行走后的最后一帧姿态 + 画面保持公墓背景·Sylvia 背影走向出口构图直至视频结束。

### ⑦ 音效层
音效层：环境音【户外风声低·落叶声·针叶林】| 动作音【软底鞋踩落叶步声 7-12s·匀速不慌张·James 站起来的动作声】| 对白【Sylvia：一字一顿·极平·word-level lip-sync；James："Stop."·低急·word-level lip-sync】| 配乐【配乐极低·弦乐长弓延音·7s Sylvia 转身时弦乐骤停只剩脚步声·最后 2s 完全静默】。

### ⑧ 禁止事项
禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、孕肚消失、Sylvia 停下或回头、Sylvia 哭泣崩溃、James 追上 Sylvia、Kennedy 离开 James 站起来、摄像机越轴（过肩反打是合法例外）、最后 2s 任何人物继续运动、镜头仍在移动、人物瞬移、跳帧抽帧。

### ⑨ 素材上传清单
素材上传清单（即梦"多参考"入口上传 4 张图）：
- @图1: works/silver-moon-manor/assets/scene_cemetery.png（公墓空间层）
- @图2: works/silver-moon-manor/assets/Sylvia人物立绘.png（Sylvia DNA）
- @图3: works/silver-moon-manor/assets/char_james_portrait.png（James DNA）
- @图4: works/silver-moon-manor/assets/costume_kennedy.png（Kennedy DNA）

---

<a id="shot-2"></a>
## Shot 2 · 客厅Alpha命令
**12s · L2**

### YAML 元数据
```yaml
shot_id: shot_2
duration: 12s
mode: L2 单首帧 + 三层 reference
scene: 银月领地豪宅客厅
shot_function: 进入客厅正面质问James→James反将一军用Alpha命令强制压制，Sylvia双腿下沉攥椅背硬撑——这是本集情绪最高爆破点之一
prev_shot_recap: Sylvia在公墓稳步离开，James叫她名字她没有停
next_shot_setup: Daisy将从走廊冲进来护在Sylvia面前，被Alpha命令波及沉默，Huxley随后出现在门口
emotion_arc: 质问的压抑逼迫 → James的愤怒反扑 → Alpha命令的无形重量压下来 → Sylvia攥椅背指节泛白硬撑不跪
assets:
  images:
    - works/silver-moon-manor/assets/costume_sylvia.png
    - works/silver-moon-manor/assets/char_james_portrait.png
  videos: []
```

### ① 版权 + 风格声明
全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，非写实渲染，简化五官，Korean webtoon illustration style；严禁摄影质感/写实渲染/3D 渲染/真人相片外观。9:16 竖屏。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无水印，纯画面叙事。

### ② 人物唯一性铁律
画面中 Sylvia 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 James 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。

### ③ @图N 说明 + 空间关系
@图1 为 Sylvia 角色 DNA（锁定面部、发型、身材、孕肚、服装、配饰）；@图2 为 James 角色 DNA（锁定面部、发型、身材、服装）。场景空间依 ep_2.json 描述建立：高挑客厅，深色实木地板，落地壁炉火焰低燃，皮质厚重沙发组，墙面深灰石材，吊灯冷光，窗帘厚重拉合，一把单人椅椅背朝向壁炉。

### ④ 核心叙事总纲
本镜为新场景首镜，通过 prompt 文字建立空间。镜头始终在 Sylvia-James 两人连线的同一侧（轴线左侧）。

### ⑤ 关键场景时间轴（故事线）
一段展现客厅正面对质与 Alpha 命令压制的激烈片段，9:16 竖屏，室内冷光，情绪由逼迫急速上升至身体被强压制、意志死撑。故事线：Sylvia 推门进客厅→James 从身后跟进带上门→正面质问三轮→James 猛地转身眼睛骤然变深→Alpha 命令砸下来→Sylvia 双腿下沉攥椅背指节泛白硬撑不跪。

### ⑥ 关键场景分镜
关键场景：① 中景·视平线·静止，0-2s @图1 Sylvia 角色主参考（画面中 Sylvia 的外貌、五官、发型、服装、身材、孕肚与配饰全部严格以 @图1 为准，禁止偏离；不得添加参考图外的服装或配件）推开大门走进客厅，壁炉在 Sylvia 背后右侧低燃，客厅吊灯冷光，画面左侧单人椅椅背清晰可见，@图2 James 角色主参考（画面中 James 的外貌、五官、发型、服装、身材与配饰全部严格以 @图2 为准，禁止偏离；不得添加参考图外的服装或配件）从她身后进来带上门，在壁炉前站定背对她，2-5s 两人空间：Sylvia 在画面前景右侧（面向 James 正面）→ James 在中景左侧（背对她）→ 单人椅在他们中间偏右，Sylvia 开口，英语对白 word-level lip-sync："Our bond is almost gone. You feel it. Tell me who she is."（三个短句·平稳逼问·每句间半拍），James 猛地转身，英语对白 word-level lip-sync："You followed me. You have no right."（短促·切断·下颌绷紧），Sylvia 英语对白 word-level lip-sync："Answer the question."（三字·无起伏·如命令），5-8s James 眼睛骤然变深，Alpha 命令以无形的力量砸下——Sylvia 的双腿往下沉，她身体前倾两手猛地抓住旁边单人椅椅背，指节泛白，全身微微颤抖，但膝盖未触地，8-12s Sylvia 死死攥住椅背，脊椎下弯但腿撑着没有跪，目光仍直视 James，喉咙里憋着什么，没有出声。最后 2s 三重静止：镜头完全停止移动 + Sylvia 攥椅背硬撑的姿态完全静止 + 画面保持 Sylvia 前景·James 中景·壁炉背景构图直至视频结束。

### ⑦ 音效层
音效层：环境音【壁炉低燃声持续·室内安静】| 动作音【门推开声·皮鞋急促进入声·门带上声·James 猛转身的衣料摩擦声·椅背被猛抓住的木质受力声】| 对白【Sylvia：平稳逼问·word-level lip-sync；James：短促切断/骤然变深·word-level lip-sync】| 配乐【配乐在 James 眼睛变深瞬间骤停·只剩壁炉声·Alpha 命令的重量用静默承载】。

### ⑧ 禁止事项
禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、孕肚消失、Sylvia 跪下（本镜Sylvia未跪·膝盖没有触地）、James 走向 Sylvia（本镜 James 站定壁炉前）、椅背消失或瞬移、Alpha 命令用可见光效呈现（应是无形力量仅靠姿态表现）、摄像机越轴、最后 2s 任何动作或运动、人物瞬移、跳帧抽帧。

### ⑨ 素材上传清单
素材上传清单（即梦"多参考"入口上传 2 张图）：
- @图1: works/silver-moon-manor/assets/costume_sylvia.png（Sylvia 客厅服装版 DNA）
- @图2: works/silver-moon-manor/assets/char_james_portrait.png（James DNA）

---

<a id="shot-3"></a>
## Shot 3 · 客厅势力登场
**12s · L3**

### YAML 元数据
```yaml
shot_id: shot_3
duration: 12s
mode: L3 首尾帧双锚 + 三层 reference
scene: 银月领地豪宅客厅
shot_function: 客厅势力一次性展开：Daisy冲入护Sylvia被Alpha命令压哑，Huxley立于门口沉默观望，Luna Miller推门而至以一个字终止暴力
prev_shot_recap: Sylvia攥住单人椅椅背指节泛白，双腿下沉但膝盖未触地，Alpha命令持续压制
next_shot_setup: Luna Miller宣布"Enough"收回Alpha命令，随后将宣布"Focus on your duties. Luna. Mother."引出真相揭露
emotion_arc: Daisy冲入（盟友出现）→ Alpha命令波及Daisy（失语压制）→ Huxley站定（沉默旁观）→ Luna Miller推门而至（权力转移）
assets:
  images:
    - works/silver-moon-manor/episodes/ep_2/end-frames/shot_2_end.png
    - works/silver-moon-manor/assets/costume_sylvia.png
    - works/silver-moon-manor/assets/char_james_portrait.png
  videos: []
```

### ① 版权 + 风格声明
全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，非写实渲染，简化五官，Korean webtoon illustration style；严禁摄影质感/写实渲染/3D 渲染/真人相片外观。9:16 竖屏。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无水印，纯画面叙事。

### ② 人物唯一性铁律
画面中 Sylvia 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 James 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 Daisy 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 Huxley 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 Luna Miller 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。

### ③ @图N 说明 + 空间关系
@图1 为上一镜末帧承接（时间层，锁住首帧：Sylvia 攥椅背·James 在壁炉前·客厅空间）；@图2 为 Sylvia 角色 DNA（锁定面部、发型、身材、孕肚、服装、配饰）；@图3 为 James 角色 DNA（锁定面部、发型、身材、服装）。本镜新增人物 Daisy·Huxley·Luna Miller 以轮廓型差异区分（无立绘）：Daisy——二十多岁女性，体型与 Sylvia 相近但无孕肚；Huxley——三十岁左右男性，体型宽壮明显高于其他人；Luna Miller——五十岁左右女性，气质沉稳权威，与客厅混乱现场形成视觉对比。

### ④ 核心叙事总纲
五人站位 Z 轴纵深：Sylvia 前景（攥椅背）→ Daisy 中景（冲入后挡在 Sylvia 前）→ James 中景（壁炉前·Daisy 正对面）→ Huxley 后景（客厅门口·沉默站立）→ Luna Miller 后景（走廊门口推门而入）。

### ⑤ 关键场景时间轴（故事线）
一段展现客厅权力格局集体登场的片段，9:16 竖屏，室内冷光，情绪密度极高但镜头平视不失控。故事线：Daisy 从走廊冲进来挡在 Sylvia 前怒问→ James 将 Alpha 命令波及 Daisy → Daisy 双手撑空气嘴动无声眼睛睁大死盯 Sylvia → Huxley 无声立于门口视线落在 Sylvia 身上 → Luna Miller 推门进来扫视一圈 → "Enough."

### ⑥ 关键场景分镜
关键场景：① 中景至全景·平视·静止（保持轴线一致），承接 @图1 末帧，0-3s @图2 Sylvia 角色主参考（画面中 Sylvia 的外貌、五官、发型、服装、身材、孕肚与配饰全部严格以 @图2 为准，禁止偏离；不得添加参考图外的服装或配件）仍攥椅背微微颤抖，Daisy（中景·二十多岁女性·体型与 Sylvia 相近但无孕肚）从走廊门猛地冲进来，挡在 Sylvia 正前方，转身面对 James，英语对白 word-level lip-sync："How could you suppress her using the Alpha command?"（怒·每字咬紧·voice breaks at end），3-6s @图3 James 角色主参考（画面中 James 的外貌、五官、发型、服装、身材与配饰全部严格以 @图3 为准，禁止偏离；不得添加参考图外的服装或配件）的视线从 Daisy 扫过去——Alpha 命令的余波波及 Daisy，Daisy 的喉咙里发出一声哽住的声音，双手撑着空气停在半空，嘴唇动了动，一个字都出不来，眼睛睁大死死盯着 Sylvia，6-9s 镜头缓缓拉到全景，Huxley（后景·客厅门口·三十岁左右男性·体型宽壮明显高于其他人）无声站定，视线落在 Sylvia 身上，停住，没有说话没有动，9-12s 走廊门被推开，Luna Miller（后景·五十岁左右女性·气质沉稳权威）走进来，扫了一眼 Daisy 僵在原地的样子，又看了看 Sylvia 攥着椅背的手，神情没有变，开口，英语对白 word-level lip-sync："Enough."（一字·比所有人声音都低·但让客厅的空气也跟着凝住）。最后 2s 三重静止：镜头完全停止移动 + 五人全部静止（Sylvia 攥椅背·Daisy 双手撑空·James 壁炉前·Huxley 门口·Luna Miller 推门后站定）+ 画面保持全景五人纵深构图直至视频结束。

### ⑦ 音效层
音效层：环境音【壁炉低燃声持续】| 动作音【走廊门猛推开声·Daisy 急促脚步声·Daisy 哽住的喉音·Alpha 余波的短暂沉默·另一侧门推开声·Luna Miller 低跟皮鞋均匀步声】| 对白【Daisy：怒·每字咬紧·word-level lip-sync；Luna Miller："Enough."·极低·一字·word-level lip-sync】| 配乐【配乐瞬停在 Luna Miller 开口前·只剩壁炉声·"Enough."之后完全静默】。

### ⑧ 禁止事项
禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、孕肚消失、Daisy 体型与 Sylvia 相同（有明显外观区别）、Huxley 体型与其他人相同（须明显宽壮高大）、Luna Miller 神情慌乱（本镜 Luna Miller 神情始终沉稳无变化）、六人以上同时出现（本镜最多五人）、Alpha 命令用可见光效、最后 2s 任何人物运动、镜头仍在移动、人物瞬移、跳帧抽帧。

### ⑨ 素材上传清单
素材上传清单（即梦"多参考"入口上传 3 张图）：
- @图1: works/silver-moon-manor/episodes/ep_2/end-frames/shot_2_end.png（上一镜末帧，时间承接）
- @图2: works/silver-moon-manor/assets/costume_sylvia.png（Sylvia DNA）
- @图3: works/silver-moon-manor/assets/char_james_portrait.png（James DNA）

---

<a id="shot-4"></a>
## Shot 4 · 真相宣判
**12s · L3**

### YAML 元数据
```yaml
shot_id: shot_4
duration: 12s
mode: L3 首尾帧双锚 + 三层 reference
scene: 银月领地豪宅客厅
shot_function: 真相揭露——Luna Miller宣布"The Pack needed an heir. You were the solution."，Sylvia是被安排的繁殖工具，这句话让客厅里所有人沉默
prev_shot_recap: Luna Miller走进客厅说"Enough"，Alpha命令的压制停止，五人全部静止
next_shot_setup: Luna Miller和James离开，Huxley也被James叫走，客厅只剩Sylvia和Daisy，二人对视
emotion_arc: Alpha命令收回（身体解放）→ Luna Miller一字一字宣布"职责"→ Sylvia质问"你知道"→ Luna Miller不否认"You were the solution."→ 客厅里彻底无声
assets:
  images:
    - works/silver-moon-manor/episodes/ep_2/end-frames/shot_3_end.png
    - works/silver-moon-manor/assets/costume_sylvia.png
    - works/silver-moon-manor/assets/char_james_portrait.png
  videos: []
```

### ① 版权 + 风格声明
全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，非写实渲染，简化五官，Korean webtoon illustration style；严禁摄影质感/写实渲染/3D 渲染/真人相片外观。9:16 竖屏。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无水印，纯画面叙事。

### ② 人物唯一性铁律
画面中 Sylvia 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 James 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 Daisy 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 Luna Miller 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 Huxley 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。

### ③ @图N 说明 + 空间关系
@图1 为上一镜末帧承接（时间层，锁住五人站位：Sylvia 前景·Daisy 中景·James 壁炉前·Huxley 门口·Luna Miller 刚推门进来）；@图2 为 Sylvia 角色 DNA（锁定面部、发型、身材、孕肚、服装、配饰）；@图3 为 James 角色 DNA（锁定面部、发型、身材、服装）。本镜 Daisy·Huxley·Luna Miller 外观延续上镜描述。

### ④ 核心叙事总纲
五人站位延续上镜：Sylvia 前景（椅背旁）→ Daisy 中景（Sylvia 前方，Alpha 余波已过但站稳）→ James 中景（壁炉前·眼神朝向地板）→ Huxley 后景（门口·沉默）→ Luna Miller 前中景（已进入客厅·气质权威）。

### ⑤ 关键场景时间轴（故事线）
一段展现真相宣判时刻的片段，9:16 竖屏，室内冷光壁炉极低燃，情绪密度在"You were the solution."落地后骤然凝固。故事线：Alpha 命令收回→Daisy猛吸气膝盖软了扶墙→Sylvia手松开椅背→Luna Miller"Focus on your duties"→Sylvia质问"You arranged this."→Luna Miller不否认"The Pack needed an heir. You were the solution."→客厅彻底无声→Luna Miller转身离开→James跟出去→Huxley脚步迈出被James叫走。

### ⑥ 关键场景分镜
关键场景：① 中景·平视·静止，承接 @图1 末帧，0-3s Alpha 命令收回——Daisy 猛地吸了口气，膝盖软了一下，右手扶住旁边壁灯架站稳；@图2 Sylvia 角色主参考（画面中 Sylvia 的外貌、五官、发型、服装、身材、孕肚与配饰全部严格以 @图2 为准，禁止偏离；不得添加参考图外的服装或配件）的右手从椅背上慢慢松开，垂在身侧，目光直视 Luna Miller，@图3 James 角色主参考（画面中 James 的外貌、五官、发型、服装、身材与配饰全部严格以 @图3 为准，禁止偏离；不得添加参考图外的服装或配件）看向地板，没有开口，3-5s Luna Miller（前中景·五十岁左右女性·气质沉稳权威）英语对白 word-level lip-sync："Focus on your duties. Luna. Mother. That is all."（慢·每个字单独落地·陈述句·无起伏·像在宣判），5-8s Sylvia 站在原地，英语对白 word-level lip-sync："You knew Kennedy couldn't have children. You arranged this. Didn't you."（不是疑问句·是陈述·一字一顿·声音平稳没有抖），Luna Miller 没有否认，嘴角动了一下，像是某个答案终于被说出来让她满意，8-10s Luna Miller 英语对白 word-level lip-sync："The Pack needed an heir. You were the solution."（慢·如事实通告·无愧疚·每字清晰），客厅里没有人说话，Daisy 的手死死捏住墙边壁灯架，James 眼神落在地板上没有开口，10-12s Luna Miller 转身走出走廊门，James 跟着进走廊带上门，Alpha 命令压力彻底散去；Huxley 的脚步迈出一步停住——走廊里传来 James 叫他名字的声音——Huxley 转身朝走廊走去。最后 2s 三重静止：镜头完全停止移动 + 客厅里只剩 Sylvia 和 Daisy 的瞬间定格 + 画面保持两人对视·壁炉背景构图直至视频结束。

### ⑦ 音效层
音效层：环境音【壁炉极低燃·室内安静】| 动作音【Daisy 吸气声·扶灯架声·椅背被松开的轻声·皮鞋均匀走廊声·门带上声·Huxley 脚步迈出再停顿·皮鞋转向走廊声】| 对白【Luna Miller：慢·陈述句·word-level lip-sync；Sylvia：一字一顿·平稳无抖·word-level lip-sync】| 配乐【Luna Miller 开口前配乐瞬停·"The Pack needed an heir."之后完全静默·只剩壁炉极低燃声·最后 2s 配乐以极低单音复起】。

### ⑧ 禁止事项
禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、孕肚消失、Luna Miller 神情愧疚（本镜 Luna Miller 神情始终沉稳甚至满意）、James 开口回应（本镜 James 全程沉默）、Sylvia 崩溃或哭泣（本镜 Sylvia 声音平稳无起伏）、Daisy 说话（本镜 Daisy 沉默）、最后 2s 任何人物运动、镜头仍在移动、人物瞬移、跳帧抽帧。

### ⑨ 素材上传清单
素材上传清单（即梦"多参考"入口上传 3 张图）：
- @图1: works/silver-moon-manor/episodes/ep_2/end-frames/shot_3_end.png（上一镜末帧，时间承接）
- @图2: works/silver-moon-manor/assets/costume_sylvia.png（Sylvia DNA）
- @图3: works/silver-moon-manor/assets/char_james_portrait.png（James DNA）

---

<a id="shot-5"></a>
## Shot 5 · 两人无声盟约
**10s · L2**

### YAML 元数据
```yaml
shot_id: shot_5
duration: 10s
mode: L2 单首帧 + 三层 reference
scene: 银月领地豪宅客厅
shot_function: 客厅只剩两人——Daisy扑过来抓住Sylvia手臂，两人对视，共同记住这句话，这是选择时刻的正前方
prev_shot_recap: Luna Miller和James先后离开客厅，Huxley被叫走，Alpha命令压力彻底散去，客厅安静
next_shot_setup: 玩家选择时刻：Sylvia可以选择沉默低下眼睛，或者说出"I heard every word. And I remember."
emotion_arc: Daisy扑过来（盟友的肉身确认）→ 两人对视（共同见证了同一件事）→ Sylvia视线落在Daisy曾撑空气的那双手上
assets:
  images:
    - works/silver-moon-manor/episodes/ep_2/end-frames/shot_4_end.png
    - works/silver-moon-manor/assets/costume_sylvia.png
  videos: []
```

### ① 版权 + 风格声明
全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading，非写实渲染，简化五官，Korean webtoon illustration style；严禁摄影质感/写实渲染/3D 渲染/真人相片外观。9:16 竖屏。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无水印，纯画面叙事。

### ② 人物唯一性铁律
画面中 Sylvia 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。画面中 Daisy 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。

### ③ @图N 说明 + 空间关系
@图1 为上一镜末帧承接（时间层，锁住首帧：客厅只剩 Sylvia 和 Daisy，两人对视·壁炉背景）；@图2 为 Sylvia 角色 DNA（锁定面部、发型、身材、孕肚、服装、配饰）。Daisy 外观：二十多岁女性，无孕肚，手腕上有 Alpha 命令留下的浅红压痕。

### ④ 核心叙事总纲
本镜仅 Sylvia + Daisy 两人，客厅里其他人已全部离开。镜头中景·平视·双人对话轴线固定。

### ⑤ 关键场景时间轴（故事线）
一段展现两人关系从安慰到盟约的转折时刻，9:16 竖屏，室内壁炉极低燃，情绪由 Daisy 的冲上来到两人无声凝视共同确认。无对白，情绪全靠动作与对视。故事线：Daisy 猛地喘了口气扑过来抓住 Sylvia 手臂→两人对视→Sylvia 视线缓缓落在 Daisy 手腕上那道浅红压痕，又抬起来→两人继续对视，谁也没有先开口。

### ⑥ 关键场景分镜
关键场景：① 中景·视平线·静止，承接 @图1 末帧，0-3s @图2 Sylvia 角色主参考（画面中 Sylvia 的外貌、五官、发型、服装、身材、孕肚与配饰全部严格以 @图2 为准，禁止偏离；不得添加参考图外的服装或配件）仍站在单人椅旁，Daisy 猛地喘了一口气，跨步扑过来，双手抓住 Sylvia 手臂，眼眶红着，强撑着没有哭，两人相距极近（中景·双人正面），3-6s Sylvia 和 Daisy 对视，谁都没有先说话，Daisy 手臂上 Alpha 命令留下的浅红压痕清晰可见，6-8s Sylvia 的视线缓缓从 Daisy 眼睛低下去，落在 Daisy 手腕上那道浅红的压痕，停了两秒，8-10s Sylvia 的视线缓缓抬回来，回到 Daisy 的眼睛，两人继续对视，客厅里只有壁炉极低的燃声。最后 2s 三重静止：镜头完全停止移动 + 两人对视的姿态完全静止 + 画面保持 Sylvia-Daisy 近距离双人正面对视·壁炉背景构图直至视频结束。

### ⑦ 音效层
音效层：环境音【壁炉极低燃声持续·室内极安静】| 动作音【Daisy 猛喘气声·脚步冲上来·手抓住手臂的接触声·两人呼吸声】| 对白【无台词·全程静默对视】| 配乐【配乐极低单音·大提琴·像心跳间隙·最后 2s 彻底静止】。

### ⑧ 禁止事项
禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、孕肚消失、Daisy 松开手（本镜 Daisy 始终抓住 Sylvia 手臂）、任何第三人出现（本镜客厅只有两人）、Sylvia 或 Daisy 开口说话（本镜无对白·全靠动作与对视）、Daisy 手腕无压痕、最后 2s 任何运动、镜头仍在移动、人物瞬移、跳帧抽帧。

### ⑨ 素材上传清单
素材上传清单（即梦"多参考"入口上传 2 张图）：
- @图1: works/silver-moon-manor/episodes/ep_2/end-frames/shot_4_end.png（上一镜末帧，时间承接）
- @图2: works/silver-moon-manor/assets/costume_sylvia.png（Sylvia DNA）

---
