@episode main/route/diego:10 "Eight Years of Cold" {

// BEAT 1 — Selena's curb. 7am. Diego in Impala. He drives her to grandpa's grave.

@bg set selena_house_porch
@music play theme_predawn_quiet

@selena show coat_zipped_breath_visible at center

YOU: 6:58. The Impala is already at the curb.

YOU: He doesn't honk.

@diego show leaning_door_arms_crossed at right

NARRATOR: Diego in black. Black hoodie. Black jeans. Two coffee cups on the dash. He's been here a while.

@diego look one_lift_chin

DIEGO: Selena.

SELENA: Navarro.

@diego look door_held_open

NARRATOR: He opens the passenger door. Doesn't ask. Just holds it.

@selena look one_brow_up_amused

YOU: He's trying. The trying is loud.

@selena hide
@diego hide

@bg set impala_interior fade
@music crossfade theme_bolero_grandpa

@selena show shoulders_inward_quiet at left
@diego show one_hand_up_steady at right

YOU: The bolero's on again. Same tape. Same voices.

YOU: Twenty minutes. He doesn't say where.

YOU: I let him not say.

DIEGO: You texted me. That night.

SELENA: Yeah.

DIEGO: I never answered. I read it four times.

YOU: He read it four times.

@diego look turning_off_highway

NARRATOR: He turns off the highway. Two-lane. Then a one-lane. Then gravel.

@selena look gaze_recognizing

YOU: A cemetery. Westbluff Memorial. Old section.

YOU: Diego doesn't go to cemeteries.

YOU: That's the first thing his father told mine, when his grandfather died: my son will not be standing at this grave.

@selena look corner_eye_quiet

YOU: He's standing at it now.

@diego hide
@selena hide

@pause for 1

// BEAT 2 — Grandpa's grave. Diego silent ten minutes. MC three steps back. He speaks.

@bg set westbluff_memorial_navarro_grave fade
@music crossfade theme_grave_morning_low

@diego show standing_squared_at_stone at center

NARRATOR: Granite. NAVARRO. ESTEBAN MATTEO. 1942-2025. Beloved father, husband, abuelo.

NARRATOR: Diego stands a foot from the stone. He doesn't kneel. He doesn't put his hand on the granite.

@selena show three_steps_back at left

YOU: I keep three steps back. I don't know his rules at a grave.

YOU: He doesn't say anything for ten minutes.

@pause for 2

@diego look exhale_visible

DIEGO: Grandpa was the only one who ever asked me how I was doing.

@selena look chest_tightening_quiet

YOU: I move one step closer. Not all the way.

YOU: I put my hand over his on the side of his thigh.

@diego look fingers_under_hers_still

NARRATOR: He doesn't grip back. He doesn't pull away. He lets it stay.

@selena look gaze_to_the_stone_soft

YOU: I want to ask what his grandfather called him. I want to ask which side of the bench he sat on. I want to ask everything.

YOU: I ask none of it.

YOU: He told me one sentence. That's the whole gift.

@diego look one_breath_letting_go

DIEGO: Selena.

SELENA: Yeah.

DIEGO: Thanks.

@diego hide
@selena hide

@pause for 1

// BEAT 3 — Back in school parking lot. He pulls his hand back. Cold reset.

@bg set school_parking_lot fade
@music crossfade theme_school_parking_lot_late

@diego show parking_quiet at right
@selena show buckling_off at left

NARRATOR: Westbluff Prep. Eight twenty-five. The student lot is full.

@diego look hand_on_gear_shift

NARRATOR: He puts the Impala in park. He doesn't kill the engine.

DIEGO: Let's keep this the way it's been, Selena.

@selena look one_blink_landing

YOU: There it is.

YOU: Forty minutes ago he let me hold his hand at his grandfather's grave. Now we're "the way it's been."

@selena look chin_steady_holding

SELENA: The way it's been is eight years of you not looking at me.

DIEGO: I know.

SELENA: That's what we're doing.

DIEGO: That's what we're doing in here.

YOU: He says it to the windshield.

YOU: He's not lying. He's not faking. He's asking for a wall I have to pretend is real.

YOU: I get out of the car without slamming the door. That part I'm proud of.

@diego hide
@selena hide

@pause for 1

// BEAT 4 — School cafeteria. Lunch. Jared makes a comment. Diego punches a locker.

@bg set school_cafeteria
@music crossfade theme_cafeteria_lunch

@selena show tray_in_hands_steady at center

NARRATOR: Cafeteria. Twelve thirty. The football table is the loud one.

@selena look feet_pausing_corner_table

YOU: I'm taking my tray to Remi's table when Jared steps into my path.

@jared show smirk_arms_loose at right

NARRATOR: Jared Cole. Westbluff senior. YOU hooked up with him freshman year. He has not let YOU forget it.

JARED: Cortez.

JARED: Hear you and Ashby split.

@selena look chin_lifting_steady

SELENA: Move.

JARED: I'm just being friendly. You always liked friendly.

@sfx play locker_slam_metal

NARRATOR: A fist hits the locker behind Jared. Hard.

@diego show fist_against_locker at right

NARRATOR: Diego. Hand still on the dent. He didn't run over. He walked.

@diego look eyes_locked_jared

DIEGO: Say that again, dickwad.

@jared look one_step_back_palms_up

NARRATOR: Jared takes one step back. Two.

JARED: Easy, Navarro. Just talking.

@diego look unmoved

DIEGO: Walk away.

NARRATOR: Jared walks away.

@jared hide

@diego look turning_no_eye_contact

NARRATOR: Diego turns. Doesn't look at YOU. Walks back to the football table.

@selena look standing_tray_still

YOU: He punched a locker for me and didn't acknowledge me.

YOU: This is what he meant by "the way it's been."

@diego hide

@pause for 1

// BEAT 5 — Cafeteria continued. Choice 2: tonality fork. MC's response to Diego's deniability.

@selena show standing_tray_thinking at center

YOU: Cafeteria's still humming. Football table's eating like nothing happened.

YOU: I have two ways through this.

@choice {
  @option A safe "Cross the cafeteria. Sit on Diego's lap for two seconds." {
    @selena look chin_up_walking
    YOU: I cross the cafeteria. Eight football players see me coming. Diego doesn't.
    @diego show football_table_eating at right
    YOU: I take his fork out of his hand. Set it down.
    @selena look sliding_onto_lap
    YOU: I sit on his lap.
    @diego look whole_body_freezing
    NARRATOR: Diego stops mid-bite. His arm comes around YOUR waist on reflex and freezes there.
    YOU: Two seconds.
    @selena look standing_off_quiet
    YOU: I get up. I straighten his hoodie. I pick up his fork. I put it back in his hand.
    SELENA: Eat your lunch, Navarro.
    @selena look turning_walking_away
    NARRATOR: YOU walk. Football table is silent. Kai whistles once. Sofia stops chewing.
    @diego hide
    @selena hide
    @affection diego +2
    @butterfly "MC walked across the cafeteria, sat on Diego's lap for two seconds in front of eight football players, fixed his hoodie and walked back. She didn't ask him to admit anything out loud — she gave the whole room the picture. Diego froze and his arm came around her on reflex. Possession seed planted hard."
  }
  @option B safe "Walk back to your own table. Eat. Don't look at the football table." {
    @selena look settling_at_remis_table
    YOU: I sit at Remi's table. I eat.
    @remi show eyebrows_up_questioning at right
    REMI: Babe. He punched a locker.
    SELENA: I saw.
    REMI: You're not going to —
    SELENA: No.
    @selena look corner_mouth_quiet
    SELENA: He said keep it the way it's been. We're keeping it the way it's been.
    @remi look chin_resting_skeptical
    REMI: For how long.
    SELENA: As long as he can.
    @remi hide
    @selena hide
    @butterfly "MC ate at Remi's table after Diego punched the locker. She didn't acknowledge it across the room. Healing tilt: she respected Diego's request to play cold even when his body wasn't playing cold."
  }
}

@pause for 1

// BEAT 6 — AP English. Empty classroom after final bell. Selena drags Diego in.

@bg set school_ap_classroom fade
@music crossfade theme_classroom_after_bell

@selena show standing_holding_door at left

NARRATOR: Last period of the day. Bell rings. Hallway empties.

@selena look hand_on_his_sleeve_pulling

NARRATOR: YOU catch his sleeve as he passes the door. Pull him into the empty classroom. Close it.

@diego show standing_caught_quiet at right

DIEGO: Selena.

@selena look back_against_door_locking

NARRATOR: YOU lock it.

@choice {
  @option A brave "Ask him: 'Why do you hate me? Not today. Since we were ten.'" {
    check { attr: BOLD, dc: 14 }
    @if (check.success) {
      @selena look chin_up_asking
      SELENA: Why do you hate me, Diego.
      SELENA: Not today. Not Jared. Since we were ten.
      @diego look one_blink_caught
      NARRATOR: Diego goes still. The kind of still that's not relaxed.
      @diego look gaze_dropping_to_floor
      DIEGO: Selena, drop it.
      SELENA: No.
      @diego look leaning_against_desk
      NARRATOR: He leans against a desk. Not facing YOU. Not facing away.
      @diego look exhale_visible_quiet
      DIEGO: I don't hate you, Selena.
      DIEGO: I hated that you didn't remember me.
      @selena look one_breath_caught
      YOU: Remember you?
      DIEGO: Forget I said it.
      @diego look hand_on_doorknob
      NARRATOR: He unlocks the door. Doesn't slam it. Walks out.
      @diego hide
      @selena look standing_alone_steady
      YOU: I hated that you didn't remember me.
      YOU: Remember what.
      @selena hide
      @signal mark MC_ASKED_WHY_HE_HATES_HER
      @affection diego +3
      @butterfly "MC pulled Diego into an empty classroom and asked the question she'd been holding for eight years. He didn't deflect. He said 'I hated that you didn't remember me' and walked out. The wall cracked. She doesn't know yet what she's supposed to remember."
    } @else {
      @selena look chin_up_starting
      SELENA: Diego.
      SELENA: Why are we doing this.
      @diego look gaze_to_her_unmoving
      DIEGO: Doing what.
      SELENA: This. The cold. The locker. The —
      @diego look hand_to_doorknob_already
      DIEGO: Drop it, Selena.
      @diego look turning_walking_out
      NARRATOR: He's gone before YOU finish the sentence.
      @diego hide
      @selena look standing_alone_jaw_tight
      YOU: I asked the wrong thing.
      YOU: I asked why we're doing this. Not why he started it.
      @selena hide
      @affection diego +1
      @butterfly "MC tried to confront Diego in the empty classroom but asked the surface question — why are we doing this — instead of the buried question. Diego deflected and left. The chance came and went."
    }
  }
  @option B safe "Roll your eyes: 'Whatever, Navarro. Keep your mood swings.'" {
    @selena look one_brow_up_dry
    SELENA: Whatever, Navarro. Keep your mood swings.
    @diego look one_blink_quiet
    NARRATOR: He looks at YOU for a beat. Doesn't say anything. Opens the door himself this time. Leaves.
    @diego hide
    @selena look standing_alone_one_breath
    YOU: I gave him the out and he took it.
    YOU: I'm starting to think the out is the whole problem.
    @selena hide
    @affection diego -1
    @butterfly "MC chose banter over confrontation. Diego left without a word. They both walked away from the door he'd cracked open at his grandfather's grave that morning. Wasted day."
  }
}

@pause for 1

// BEAT 7 — Selena's bedroom. Diary check. The forgotten butterfly drawing.

@bg set selena_house_bedroom fade
@music crossfade theme_bedroom_late_night

@selena show desk_drawer_open_searching at center

YOU: Late. Twenty past eleven. Mariana's asleep down the hall.

YOU: I'm digging in the bottom of my closet for the box. The one with my ten-year-old garbage in it.

@selena look pulling_thin_diary

YOU: Pink composition book. "Selena Cortez Top Secret Property of Eyeballs Get Wrecked." I pressed too hard with the marker.

@selena look flipping_pages_quick

YOU: I look for "Diego." I don't find his name.

YOU: I look harder. Page nine. Half a butterfly drawn in green pencil.

@selena look reading_aloud_mouthing

YOU: Below the butterfly: "for the boy who catches them too."

YOU: I don't remember writing that.

YOU: I would remember writing that. I am the kind of person who remembers what I wrote at ten.

YOU: I wrote it. I forgot it.

@selena look closing_book_slow

YOU: Diego said: I hated that you didn't remember me.

YOU: Remember what.

@selena look gaze_to_window_thinking

YOU: There was a boy who used to sit on his porch and watch me run after butterflies in the yard between our houses.

YOU: I knew his name. I just stopped saying it.

@sfx play phone_buzz_short

@phone show {
  @text from diego: Tomorrow.
}
@phone hide

@selena look corner_mouth_dry

YOU: That's a whole text.

YOU: Tomorrow.

@selena look fingers_to_pendant

YOU: Camila posted a story this afternoon. "single now, ladies." She doesn't know why Weston broke up with her. She thinks she won.

YOU: She thinks she won a fight that wasn't even hers.

YOU: Diego is across town in his bedroom right now choosing not to tell me what I forgot.

YOU: I am not going to learn this from him.

YOU: I'm going to learn it from me.

YOU: I'm Selena fucking Cortez. I don't get to forget things and have them matter.

@selena hide

@butterfly "MC found a half-drawn butterfly in her ten-year-old diary with the line 'for the boy who catches them too.' She didn't remember writing it. Diego said she didn't remember him. She's starting to suspect she did remember and chose to forget."

@pause for 1

@gate {
  @else: @next main/route/diego:11
}

}
