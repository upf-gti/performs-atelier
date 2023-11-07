import * as THREE from "three"

class AUConfigurer {
    constructor( model, scene) {
        this.model = model;
        this.scene = scene;

    }

    exportJSON(){
        // [ bone assigned, position in mesh coordinates, direction in mesh coordinates ]
        let result = {};
        result.parts = {"BodyMesh": "2"};
        // result.boneMap = JSON.parse( JSON.stringify( boneMap ) );

        return result;
    }
}
export{ AUConfigurer };