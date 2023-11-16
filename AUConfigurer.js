import * as THREE from "three"


class AUConfigurer {
    constructor( model, scene) {
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

        this.avatarParts = [];
        this.blendshapes = this.getBlendshapes();
    }

    getBlendshapes(){
        var blendshapes = {};

        for (let i = 0; i < this.model.children[0].children.length; i++) {
            let part = this.model.children[0].children[i];
            if (part.morphTargetDictionary){
                this.avatarParts.push(part);
                for (const bsName in part.morphTargetDictionary){
                    if (!blendshapes[bsName]) blendshapes[bsName] = [];
                    blendshapes[bsName].push(part);
                }
            };
        }
        return blendshapes;
    }

    exportJSON(){
        // [ bone assigned, position in mesh coordinates, direction in mesh coordinates ]
        let result = { };
        result["parts"] = { };
        // { "au": [ [parts, bsname, factor], ... ] }
        
        for ( const au in this.au2bs) {
            for ( let i = 0; i < this.au2bs[au].length; i++ ) {
                let parts = this.au2bs[au][i][0];
                let bsName = this.au2bs[au][i][1].onGetValue();
                let factor = this.au2bs[au][i][2].onGetValue();
                this.blendshapeMap[au].push([bsName, factor]);
                
                for (let j = 0; j < parts.length; j++) {
                    let part = parts[j].name;
                    if ( !result.parts[part]) result.parts[part] = [];
                    result.parts[part].push(au);
                }
            }
        }
        result.blendshapeMap = this.blendshapeMap;
        // result.boneMap = JSON.parse( JSON.stringify( boneMap ) );

        return result;
    }
}
export{ AUConfigurer };