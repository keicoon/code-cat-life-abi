// ============================================================
//  Code Cat Playground — open this file and wait 5 seconds!
// ============================================================

import { Cat } from "./imaginary-cat";

//        ↓ The cat will walk across these lines ↓

class PlatformWorld {
    private gravity = 9.8;
    private platforms: string[] = [];

    constructor() {
        this.platforms = [
            "ground-floor",
            "second-floor",
            "rooftop",
        ];
    }

    buildStaircase(): void {
        for (let i = 0; i < 5; i++) {
            console.log("step " + i);
        }
    }

    jump(height: number): number {
        return height * 2 - this.gravity;
    }
}

function shortLine() { return 1; }

function anotherShortLine() { return 2; }

                                                    function farRight() { return "way over here"; }

function backToLeft() {
    const x = 10;
    const y = 20;
    return x + y;
}

// --- gap above (empty lines = cat must jump!) ---



// --- the cat landed here after jumping ---

const island = {
    width: 40,
    height: 10,
    treasure: "fish",
};

function longLineForRunning_____________________________________________() {
    return "the cat can run a long distance on this line without jumping!";
}

function aVeryLongFunctionNameThatGoesOnAndOnSoTheCatHasLotsOfRoomToRun() {
    return "wheeeee!";
}



// ---- Tall Tower (cat climbs up one line at a time) ----

function floor1() { return "lobby"; }
function floor2() { return "office"; }
function floor3() { return "meeting room"; }
function floor4() { return "cafeteria"; }
function floor5() { return "observation deck"; }

// ---- Scattered Islands (tests jumping & falling) ----

const islandA = "left";

                              const islandB = "center";

                                                                    const islandC = "right";

            const islandD = "back-left";

                                          const islandE = "mid-right";

// ---- Dense Block (lots of text to walk across) ----

const config = {
    catColor: "#ffffff",
    fishInterval: 8,
    animationSpeed: 1.0,
    showFootprints: true,
    enabled: true,
    theme: "dark",
    mood: "playful",
    favoriteFood: "fish",
    napDuration: 3600,
    curiosityLevel: 100,
};

// ============================================================
//  Tips:
//  - Wait 5s idle → cat appears on nearest text line
//  - Fish spawns after 8s → cat chases it!
//  - Type anything → cat disappears instantly
//  - Try: Cmd+, → search "Code Cat" → change catColor
// ============================================================
