@episode main/route/weston:10 "Vet Dream" {

// BEAT 1 — Saturday morning. Weston picks MC up. Cover story.

@bg set selena_house_porch
@music play theme_morning_quiet

@selena show casual_jeans_steady at center

YOU: Saturday. Eight AM. Weston is in my driveway in his car — front-of-the-house version, because his father thinks he's "playing pickup with Luca and the team."

YOU: He told his father he's playing pickup. He told Luca he was busy. He told me to wear something I don't mind getting dirty.

@weston show worn_tee_unguarded at right

@weston look one_corner_up_quiet

WESTON: Hey.

SELENA: That's not your basketball-jersey face.

WESTON: No.

@weston look turning_to_passenger

WESTON: Get in.

@selena look chin_tilt_assessing

YOU: He's wearing a faded T-shirt I have never seen and jeans with a rip that wasn't bought, it was earned.

YOU: This isn't Golden Boy.

YOU: This is whoever Weston was before they pinned the Golden Boy on him.

@selena hide
@weston hide

@pause for 1

// BEAT 2 — Animal rescue. Weston's hidden volunteer life.

@bg set rescue_shelter_yard fade
@music crossfade theme_rescue_warm_simple

@selena show standing_observing at center

YOU: Forty minutes east. A small concrete yard behind a building with chain link and a hand-painted sign that says SECOND CHANCE RESCUE.

YOU: I have lived in Westbluff my whole life. I have never been here.

@weston show worn_tee_unguarded at right

@weston look hand_at_back_of_neck_uneasy

WESTON: I should have told you what this was.

SELENA: You should have. But — keep talking.

@weston look chest_lift_explaining

WESTON: I started volunteering here freshman year. My dad doesn't know. Coach doesn't know.

WESTON: It's just Saturdays. Two hours. I clean kennels. Sometimes I do the meds round if Janelle's short.

@selena look eyes_narrowing_curious

SELENA: Janelle?

@weston look almost_smile_easy

WESTON: She runs the place. She thinks I'm a community service kid. She doesn't ask which school.

@weston look turning_toward_door

WESTON: There's a dog. Three legs. He came in last week. Janelle asked me to handle his eight AM meds the next time I came in.

WESTON: That's the next time. That's now.

@selena look corner_of_mouth_softening

SELENA: Show me.

@weston hide
@selena hide

@pause for 1

// BEAT 3 — Inside the kennel. Weston with the three-legged dog.

@bg set rescue_shelter_kennel
@music crossfade theme_rescue_quiet_intimate

@weston show kneeling_to_dog at left

YOU: I know this image is going to live in my head forever before I finish noticing it.

YOU: Weston Grant Ashby. On the concrete floor of a back-alley dog kennel. T-shirt with a smear of food on the hem. Hands holding a small plastic syringe of something pink.

YOU: A three-legged brown mutt with one ear chewed up. The dog is leaning his entire side weight against Weston's thigh.

@selena show standing_at_door at center

@selena look eyes_wide_unguarded

YOU: Weston is talking to the dog the way other people talk to babies — quiet, slow, no consonants too sharp.

WESTON: Hey. I know. I know.

WESTON: One small sting. Then a treat.

YOU: The dog opens his mouth. Weston squirts the medicine in. The dog swallows. Weston's face goes from focused to relieved.

@weston look palm_open_to_dog

WESTON: Good boy. Yeah. Good boy.

@weston bubble heart

@selena look one_breath_arrested

YOU: I am watching a different person.

YOU: I have known the version of Weston who can talk a teacher out of detention with a head tilt.

YOU: I have not known this one.

YOU: This one is the one his father killed at six.

@weston look one_corner_up_to_her

WESTON: Don't make a face. Come help.

@selena look turning_to_him

SELENA: Move over.

@selena hide
@weston hide

@pause for 1

// BEAT 4 — Lunch. Cup of noodles. The vet question.

@bg set rescue_shelter_back_office
@music crossfade theme_rescue_warm_simple

@selena show leaning_against_desk at left

YOU: Twelve thirty. Janelle ordered cup ramen for everyone. Weston is leaning against the back of the desk eating his with a plastic spoon because the chopsticks were gone.

@weston show leaning_eating_easy at right

@weston look one_corner_up_eating

WESTON: My dad would lose his mind.

SELENA: That you're eating cup ramen, or that you ate it from a desk in a shelter?

WESTON: Yes.

@selena look quiet_smile_settled

YOU: He's looking at the dog through the office window. The dog is asleep.

YOU: There is a question I have wanted to ask Weston Grant Ashby for thirteen months.

YOU: I have never asked it because every time I started to, his shoulders went up half an inch and I told myself he wasn't ready.

YOU: He's ready. I'm the one who wasn't.

@choice {
  @option A brave "Forget your dad's plan. What did you actually want to be when you were a kid?" {
    check { attr: SMART, dc: 10 }
    @if (check.success) {
      @selena look chin_resting_on_hand_quiet
      SELENA: West.
      @weston look turning_unguarded
      WESTON: Yeah.
      SELENA: Forget USC. Forget your dad's company. When you were eight.
      SELENA: What did you actually want to be?
      @weston look swallow_eyes_dropping
      YOU: He looks at the cup. He looks at the dog. He looks at the cup again.
      YOU: His shoulders don't go up.
      WESTON: Vet.
      @selena look chin_tilt_listening
      SELENA: Vet.
      WESTON: Vet. Yeah.
      @weston look one_breath_steadying
      WESTON: I told my dad in sixth grade. He laughed. He said "you want to put your hands in dog shit?"
      WESTON: That night I burned the encyclopedia. The one Mom got me. Dog Vet 101.
      WESTON: I haven't said the word out loud since.
      @selena look one_breath_held
      YOU: He said the word out loud. With me. In a back office in a shelter where the closest thing to a Whitcombe Ashby is a chipped coffee mug.
      SELENA: Vet, West.
      @weston look one_corner_up_softer
      WESTON: Vet, Lena.
      @signal mark WESTON_TOLD_MC_VET_DREAM
      @affection weston +3
      @butterfly "MC 第一次问了 Weston 一个没有父亲框架的问题——他第一次给出了没有父亲框架的答案。'Vet.' 他说出了他十二年没说出口的那个词"
      @butterfly "[awakening signature] Weston 背着父亲在救援站偷偷做了三年 volunteer——MC 没劝他'小心点 Whitcombe 会发现'，没把这件小反叛抢过去帮他管理。她让这件偷来的事属于他自己"
    } @else {
      @selena look words_choking_back
      SELENA: West, what did you — never mind.
      @weston look hand_lift_searching
      WESTON: What?
      @selena look smile_pulled_short
      SELENA: Nothing. Eat your ramen.
      YOU: I had it. I had the question. It was in my mouth.
      YOU: I swallowed it because I was scared of what he'd say.
      @butterfly "MC 想问 Weston 真心想做什么——但她在喉咙里把问题吞回去了，那个窗口关上了"
    }
  }
  @option B safe "Ask about USC. The official version." {
    @selena look casual_keeping_safe
    SELENA: How's the USC thing going? Coach happy?
    @weston look easy_smile_resetting
    WESTON: Yeah. Coach is happy. Dad's happy. It's all happening.
    YOU: He gave me the answer he has for that question. We have had this exact exchange three times this fall.
    YOU: I had a different question in my head. I asked the safe one.
    @butterfly "MC 还是问了 Weston 的'官方人生'，他用熟悉的模板回答，两人的距离没推进"
    @butterfly "[sweet-secret signature] Weston 对父亲的电话能秒切 Golden Boy 模式，MC 看着他撒谎——她没追问也没挑战，她接受了 Weston 在父亲面前必须是一个版本、在她面前是另一个版本，这种双面结构让她有一瞬觉得 arousing"
  }
}

@selena hide
@weston hide

@pause for 1

// BEAT 5 — Father's call. Weston's switch.

@bg set rescue_shelter_yard fade
@music crossfade theme_low_string_warning

@selena show standing_arms_loose at center

YOU: Two PM. We're outside. Weston is wiping kibble dust off his jeans.

@weston show standing_easy at right

@sfx play phone_buzz_short

YOU: His phone. The screen says DAD.

YOU: I watch him become someone else in three seconds.

@weston look spine_lifting_smile_assembling

WESTON: Hey, sir.

@weston look chin_up_voice_bright

WESTON: Good. We're good. Yeah, just finished pickup. Luca had threes today.

WESTON: Yeah. No, the Sutton dinner Sunday — I'll be there. Yes, sir.

WESTON: ... I love you too, Dad.

@sfx play phone_click_quiet

YOU: He pockets the phone. The Golden Boy walks back out of his face like it has somewhere to be.

@weston look turning_uneasy_to_her

WESTON: Sorry.

SELENA: Don't apologize.

@selena look quiet_steady

YOU: I have watched Weston lie to his father twenty times. I have never watched him lie to his father about being with me.

YOU: Today he didn't lie about me. He lied about Luca to keep me a secret from Whitcombe Ashby.

YOU: I noticed the difference.

YOU: I am supposed to find the difference comforting.

YOU: I am still working on the supposed-to part.

@selena hide
@weston hide

@pause for 1

// BEAT 6 — Drive home. Late afternoon.

@bg set highway_dusk fade
@music crossfade theme_drive_home_soft

YOU: Five forty-seven PM. Long shadows on the freeway.

YOU: We have not talked since the call.

YOU: Weston's hand is on the wheel. My head is against the cool glass of the passenger window.

YOU: He clears his throat.

WESTON: Lena.

SELENA: Yeah.

WESTON: Thank you.

WESTON: I haven't... I haven't done a day like this in years.

YOU: I think about the dog falling asleep against his thigh.

YOU: I think about him saying "Vet" out loud — if MC asked it.

YOU: I do not think about Whitcombe Ashby. I refuse to.

YOU: Whitcombe Ashby thinks about it for me anyway.

@pause for 1

// BEAT 7 — Selena's bedroom. Diego's text. Sketchbook.

@bg set selena_house_bedroom fade
@music crossfade theme_bedroom_late_night

@selena show standing_at_desk_pen_in_hand at center

YOU: Nine PM. Home. I drop my bag and stop at my desk.

YOU: I open my sketchbook to a clean page. I write one word. Vet.

YOU: I look at it for a count of ten.

@sfx play phone_buzz_soft

@selena look phone_picked_up

@phone show {
  @text from DIEGO: Got your message. We're good, Selena. Take care of yourself.
}
@phone hide

YOU: I read it three times.

YOU: Diego Navarro doesn't write text messages with periods at the end. Diego Navarro doesn't write the words "take care of yourself."

YOU: Diego Navarro is closing a door.

@selena look chin_down_throat_tight

YOU: I stand there with my thumb hovering over the typing window.

YOU: I have eight years of things I never said to him. They are all sitting on my tongue right now.

YOU: I don't type any of them.

YOU: I close the message. I close the phone. I close the laptop.

@selena look turning_to_sketchbook

YOU: I look at the word on the sketchbook page. Vet.

YOU: It's a small word. It's the smallest thing Weston has ever given me.

YOU: It might be the only real thing.

@selena hide

@butterfly "MC 选了 Weston，Diego 用一条 SMS 正式退到 friend 位置——'Take care of yourself' 是结束。MC 没回。她把那个窗口关上了，回头看着她写下的 'Vet'"

@pause for 1

@gate {
  @else: @next main/route/weston:11
}

}
