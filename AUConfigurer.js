class AUConfigurer {
    constructor( model, scene, initConfig = null) {
        this.model = model;
        this.scene = scene;

        this.blendshapeMap = {
            "Inner_Brow_Raiser": [],
            "Outer_Brow_Raiser_Left": [],
            "Outer_Brow_Raiser_Right": [],
            "Brow_Lowerer_Left": [],
            "Brow_Lowerer_Right": [],
            "Nose_Wrinkler_Left": [],
            "Nose_Wrinkler_Right": [],
            "Nostril_Dilator": [],
            "Nostril_Compressor": [],
            "Dimpler_Left": [],
            "Dimpler_Right": [],
            "Upper_Lip_Raiser_Left": [],
            "Upper_Lip_Raiser_Right": [],
            "Lip_Corner_Puller_Left": [],
            "Lip_Corner_Puller_Right": [],
            "Lip_Corner_Depressor_Left": [],
            "Lip_Corner_Depressor_Right": [],
            "Lower_Lip_Depressor_Left": [],
            "Lower_Lip_Depressor_Right": [],
            "Lip_Puckerer_Left": [],
            "Lip_Puckerer_Right": [],
            "Lip_Stretcher_Left": [],
            "Lip_Stretcher_Right": [],
            "Lip_Funneler": [],
            "Lip_Pressor_Left": [],
            "Lip_Pressor_Right": [],
            "Lips_Part": [],
            "Lip_Suck_Upper": [],
            "Lip_Suck_Lower": [],
            "Lip_Wipe": [],
            "Tongue_Up": [],
            "Tongue_Show": [],
            "Tongue_Bulge_Left": [],
            "Tongue_Bulge_Right": [],
            "Tongue_Wide": [],
            "Mouth_Stretch": [],
            "Jaw_Drop": [],
            "Jaw_Thrust": [],
            "Jaw_Sideways_Left": [],
            "Jaw_Sideways_Right": [],
            "Chin_Raiser": [],
            "Cheek_Raiser_Left": [],
            "Cheek_Raiser_Right": [],
            "Cheek_Blow_Left": [],
            "Cheek_Blow_Right": [],
            "Cheek_Suck_Left": [],
            "Cheek_Suck_Right": [],
            "Upper_Lid_Raiser_Left": [],
            "Upper_Lid_Raiser_Right": [],
            "Squint_Left": [],
            "Squint_Right": [],
            "Blink_Left": [],
            "Blink_Right": [],
            "Wink_Left": [],
            "Wink_Right": [],
            "Neck_Tightener": []
        }

        this.au2bs = {};

        this.avatarParts = {}; // {"part name": object, ...}
        this.partsMap = {}; // {"part name": ["action unit 1", "action unit 2"...], ...}
        this.blendshapes = this.getBlendshapes(); // {"bs name": [mesh, mesh], ...}
        
        if (initConfig) this.readConfigFile(initConfig);
        else this.automapBS2AU();
    }

    getBlendshapes(){
        var blendshapes = {};

        for (let i = 0; i < this.model.children[0].children.length; i++) {
            let part = this.model.children[0].children[i];
            if (part.morphTargetDictionary){
                this.avatarParts[part.name] = part;
                this.partsMap[part.name] = [];
                for (const bsName in part.morphTargetDictionary){
                    if (!blendshapes[bsName]) blendshapes[bsName] = [];
                    blendshapes[bsName].push(part);
                }
            };
        }
        return blendshapes;
    }

    readConfigFile(initConfig) {
        for (const au in initConfig.blendshapeMap) {
            for (let i = 0;  i < initConfig.blendshapeMap[au].length; i++) {
                this.blendshapeMap[au].push( initConfig.blendshapeMap[au][i] );
            }
        }
    }

    strIncludesArrayElement(str, arr) {
        for (let i = 0; i < arr.length; i++) {
            if ( str.includes(arr[i]) ) return true;
        }
        return false;
    }

    findWords(bsName, words) {
        let extraWords = {
            "raiser":  ["raise", "up"],
            "lowerer":  ["lower","down"],
            "lip":  ["lip", "mouth"],
            "stretcher":  ["stretch", "open"],
            "blow":  ["blow", "puff"],
            "thrust":  ["thrust", "forward", "foreward"],
            "suck":  ["suck", "roll"],
            "drop":  ["drop", "down"], 
            "wrinkler":  ["wrinkle", "scrunch", "sneer"],
            "dimpler": ["dimple"],
            "puckerer": ["pucker"],
            "funneler": ["whistle", "funnel"],
            "wide": ["open"],
            "left": ["left", "_l"],
            "right": ["right", "_r"]
        };
        
        for (let j = 0; j < words.length; j++) {
            let word = words[j].toLocaleLowerCase();
            
            // check other similar words
            if ( extraWords[word] ) {
                if ( !this.strIncludesArrayElement(bsName.toLocaleLowerCase(), extraWords[word]) ) {
                    return false;
                }
            } // if there is no coincidence, move on to the next bs
            else { if ( !bsName.toLocaleLowerCase().includes(word) ) { return false; } } // move to next bs
            
            // if here -> word is included in bs
            if ( j < words.length - 1 ) { continue; } // if there are more words to look for, keep going
            
            return true;
        }

    }
    
    automapBS2AU() {

        // look for official au name or a more common/daily use name
        let extraAU = {
            "Lip_Corner_Puller_Left": "Smile_Left",
            "Lip_Corner_Puller_Right": "Smile_Right",
            "Lip_Corner_Depressor_Left": "Frown_Left",
            "Lip_Corner_Depressor_Right": "Frown_Right",
            "Lower_Lip_Depressor_Left": "Lower_Lip_Down_Left",
            "Lower_Lip_Depressor_Right": "Lower_Lip_Down_Right",
            "Upper_Lid_Raiser_Left": "Eye_Wide_Left",
            "Upper_Lid_Raiser_Right": "Eye_Wide_Right"
        };

        for (const auName in this.blendshapeMap) {
            let words;
            // for each action unit search all blendshapes
            for (const bsName in this.blendshapes) {
                words = auName.split("_"); // search each word of the au
                
                if ( this.findWords(bsName, words) ) {
                    this.blendshapeMap[auName].push([bsName, 1.0]); // if last word to check is included, add bs to au map
                }
                
                if (extraAU[auName]) {
                    words = extraAU[auName].split("_");
                    if ( this.findWords(bsName, words) ) {
                        this.blendshapeMap[auName].push([bsName, 1.0]); // if last word to check is included, add bs to au map
                    }
                }

            }
        }
    }

    exportJSON(){
        // [ bone assigned, position in mesh coordinates, direction in mesh coordinates ]
        let result = { };
        result["parts"] = {...this.partsMap};

        for (const part in result.parts) {
            if ( !result.parts[part].length ) result.parts[part] = null;
            result.parts[part] = [...new Set(result.parts[part])]
        }
        
        // { "au": [ [bsname, factor], ... ] }
        for ( const au in this.au2bs) {
            for ( let i = 0; i < this.au2bs[au].length; i++ ) {
                try { this.au2bs[au][i][0].onGetValue() }
                catch {
                    this.au2bs[au].splice(i, 1); // delete empty au's
                    i--;
                    continue;
                }
                
                let bsName = this.au2bs[au][i][0].onGetValue();
                let factor = this.au2bs[au][i][1].onGetValue();
                this.blendshapeMap[au].push([bsName, factor]);
            }
        }
        result.blendshapeMap = this.blendshapeMap;

        return result;
    }
}
export{ AUConfigurer };