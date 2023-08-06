import * as THREE from "three"
import { disposeObjectSafeThreejs, findIndexOfBone, objectConcat } from "./Utils.js";



let boneMap = {
    "Head":           "mixamorig_Head",
    "Neck":           "mixamorig_Neck",
    "ShouldersUnion": "mixamorig_Spine2", // aka chest
    "Stomach":  	  "mixamorig_Spine1",
    "BelowStomach":   "mixamorig_Spine",
    "Hips":			  "mixamorig_Hips",
    "RShoulder":      "mixamorig_RightShoulder",
    "RArm":           "mixamorig_RightArm",
    "RElbow":         "mixamorig_RightForeArm",
    "RWrist":         "mixamorig_RightHand",
    "RHandThumb":     "mixamorig_RightHandThumb1",
    "RHandIndex":     "mixamorig_RightHandIndex1",
    "RHandMiddle":    "mixamorig_RightHandMiddle1",
    "RHandRing":      "mixamorig_RightHandRing1",
    "RHandPinky":     "mixamorig_RightHandPinky1",
    "LShoulder":      "mixamorig_LeftShoulder",
    "LArm":           "mixamorig_LeftArm",
    "LElbow":         "mixamorig_LeftForeArm",
    "LWrist":         "mixamorig_LeftHand",
    "LHandThumb":     "mixamorig_LeftHandThumb1",
    "LHandIndex":     "mixamorig_LeftHandIndex1",
    "LHandMiddle":    "mixamorig_LeftHandMiddle1",
    "LHandRing":      "mixamorig_LeftHandRing1",
    "LHandPinky":     "mixamorig_LeftHandPinky1"
}

class Configurer {
    constructor( skeleton, model, scene ){
        this.model = model;
        this.skeleton = skeleton;
        this.skeleton.pose();
        this.skeleton.bones[0].updateWorldMatrix( true, true ); // parents and children also
        this.scene = scene; scene.updateWorldMatrix( true, true );

        this.boneMap = {};
        for( let b in boneMap ){
            this.boneMap[b] = findIndexOfBone( this.skeleton, boneMap[b] );
        }

        this.frontAxisMeshCoords = new THREE.Vector3();
        this.upAxisMeshCoords = new THREE.Vector3();
        this.rightAxisMeshCoords = new THREE.Vector3();
        this.worldZ = new THREE.Vector3();
        this.worldY = new THREE.Vector3();
        this.worldX = new THREE.Vector3();

        // matrices to convert from world space to MESH coordinates (not bone coordinates)
        this.meshToWorldMat4 = (new THREE.Matrix4);
        this.meshToWorldMat3 = (new THREE.Matrix3);


        this.rayDir = new THREE.Vector3();
        this.rayOr = new THREE.Vector3();
        this.raycaster = new THREE.Raycaster();


        this.points = {
            body: [],
            handL: [],
            handR: [],
        };

        this.computeAxes();
        this.computeConfig();
    }

    computeAxes(){
        this.skeleton.bones[0].updateWorldMatrix( true, true ); // parents and children also

        this.meshToWorldMat4.multiplyMatrices( this.skeleton.bones[0].matrixWorld, this.skeleton.boneInverses[0] );
        this.meshToWorldMat4Inv = this.meshToWorldMat4.clone().invert();
        this.meshToWorldMat3.setFromMatrix4( this.meshToWorldMat4 );
        this.meshToWorldMat3Inv = this.meshToWorldMat3.clone().invert();

        let a = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.LShoulder ].clone().invert() );
        let b = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.RShoulder ].clone().invert() );
        this.rightAxisMeshCoords.subVectors( a, b ).normalize();

        a = a.setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.BelowStomach ].clone().invert() );
        b = b.setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.Hips ].clone().invert() );
        this.upAxisMeshCoords.subVectors( a, b ).normalize();
        
        this.frontAxisMeshCoords.crossVectors( this.rightAxisMeshCoords, this.upAxisMeshCoords ).normalize();
        
        this.worldZ = this.frontAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        this.worldY = this.upAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        this.worldX = this.rightAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();

    }

    computeConfig( ){
        this.skeleton.bones[0].updateWorldMatrix( true, true ); // parents and children also

        this.deleteAllPoints();

        this.computeBodyLocations();
        this.computeFaceLocations();
        this.computeArmLocations( false ); // right
        this.computeArmLocations( true ); // left
        this.computeHandLocations( false ); // right
        this.computeHandLocations( true ); // left

    }

    deleteAllPoints(){
        for ( let a in this.points ){
            this.points[a] = [];
        }

    }

    _findPointInList( list, name ){
        for ( let i = 0; i < list.length; ++i ){
            if ( list[i].name == name ){ return { idx: i, obj: list[i] }; }
        }
        return null;
    }
    _createPoint( list, name, boneAssigned, wpos, wdir = null, color = null ){
        if ( !list || !wpos || this._findPointInList( list, name ) ){ return null; }
        list.push( { name: name, boneAssigned: boneAssigned, wpos: new THREE.Vector3(wpos.x,wpos.y,wpos.z), wdir: wdir? new THREE.Vector3(wdir.x,wdir.y,wdir.z) : null , color: color } );
    }

    createHandPoint( isLeft, name, boneAssigned, wpos, color = null ){
        let destList = isLeft? this.points.handL : this.points.handR;
        return this._createPoint( destList, name, boneAssigned, wpos, null, color );
    }

    createBodyPoint( name, boneAssigned, wpos, wdir, color = null ){
        return this._createPoint( this.points.body, name, boneAssigned, wpos, wdir, color );
    }

    _deletePoint( list, name ){
        let o = this._findPointInList( list, name );
        if ( !o ){ return false; }
        list.splice( o.idx, 1 );
        return true;
    }
    deleteHandPoint( isLeft, name ){
        let destList = isLeft ? this.points.handL : this.points.handR;
        this._deletePoint( destList, name );
    }

    deleteBodyPoint( name ){ 
        this._deletePoint( this.points.body, name ); 
    }

    // based on the 3d spherical dir, the ellipsoidal direction is computed. Only the X & Z axes are used. The Y is automatically discarded
    sphericalToEllipsoidal( worldDir ){
        let a = 2;
        let b = 1;
        let x = this.worldX.dot( worldDir );
        let z = this.worldZ.dot( worldDir );
        let resultX = 2*x / (a*a);
        let resultZ = 2*z / (b*b);
        let result = new THREE.Vector3();
        result.x = resultX * this.worldX.x + resultZ * this.worldZ.x;
        result.y = resultX * this.worldX.y + resultZ * this.worldZ.y;
        result.z = resultX * this.worldX.z + resultZ * this.worldZ.z;
        result.normalize();
        return result;
    }

    computeFaceLocations(){        
        // directions are not in world nor in mesh coords. x*rightAxisMeshCoords, y*upAxisMeshCoords, z*frontAxisMeshCoords
        let faceLocations = { 
            headtop:    { x: 0, y: Math.sin( 60 * Math.PI/180 ), z: Math.cos( 60 * Math.PI/180 ) },
            forehead:   { x: 0, y: Math.sin( 42 * Math.PI/180 ), z: Math.cos( 42 * Math.PI/180 ) },

            eyebrowsLine: { x: 0, y: Math.sin( 35 * Math.PI/180 ), z: Math.cos( 35 * Math.PI/180 ) },
            eyebrowR:   { x: Math.cos( 102 * Math.PI/180 ), y: Math.sin( 38 * Math.PI/180 ), z: Math.cos( 38 * Math.PI/180 ) },
            eyebrowL:   { x: Math.cos( 78 * Math.PI/180 ),  y: Math.sin( 38 * Math.PI/180 ), z: Math.cos( 38 * Math.PI/180 ) },
            eyesLine:   { x: 0, y: Math.sin( 30 * Math.PI/180 ), z: Math.cos( 30 * Math.PI/180 ) },
            eyeR:       { x: Math.cos( 104 * Math.PI/180 ), y: Math.sin( 30 * Math.PI/180 ), z: Math.cos( 30 * Math.PI/180 ) },
            eyeL:       { x: Math.cos( 76 * Math.PI/180 ),  y: Math.sin( 30 * Math.PI/180 ), z: Math.cos( 30 * Math.PI/180 ) },

            earR:       { x: Math.sin( -70 * Math.PI/180 ), y: Math.sin( 35 * Math.PI/180 ), z: Math.cos( -70 * Math.PI/180 ) },
            earL:       { x: Math.sin( 70 * Math.PI/180 ), y: Math.sin( 35 * Math.PI/180 ), z: Math.cos( 70 * Math.PI/180 ) },
            earlobeR:   { x: Math.sin( -70 * Math.PI/180 ), y: Math.sin( 10 * Math.PI/180 ), z: Math.cos( -70 * Math.PI/180 ) },
            earlobeL:   { x: Math.sin( 70 * Math.PI/180 ), y: Math.sin( 10 * Math.PI/180 ), z: Math.cos( 70 * Math.PI/180 ) },

            nose:       { x: 0, y: Math.sin( 15 * Math.PI/180 ), z: Math.cos( 15 * Math.PI/180 ) },
            belownose:  { x: 0, y: Math.sin( 7 * Math.PI/180 ), z: Math.cos( 7 * Math.PI/180 ) },
            cheekR:     { x: Math.sin( -30 * Math.PI/180 ), y: 0, z: Math.cos( -30 * Math.PI/180 ) },
            cheekL:     { x: Math.sin( 30 * Math.PI/180 ), y: 0, z: Math.cos( 30 * Math.PI/180 ) },
            mouth:      { x: 0, y: 0, z: 1 },
            chin:       { x: 0, y: Math.sin( -20 * Math.PI/180 ), z: Math.cos( -20 * Math.PI/180 ) },
            underchin:  { x: 0, y: Math.sin( -30 * Math.PI/180 ), z: Math.cos( -30 * Math.PI/180 ) },
        }
        
        // compute front, up, right in scene world coordinates. Use root as the one defining the rotation difference from bind
        let worldZ = this.worldZ;
        let worldY = this.worldY;
        let worldX = this.worldX;

        let worldHeadPos = this.skeleton.bones[ this.boneMap[ "Head" ] ].getWorldPosition( new THREE.Vector3() );
        let worldDir = new THREE.Vector3(0,0,0); // direction for the ray

        let sides = [ "_SideLL", "_SideL", "", "_SideR", "_SideRR" ]; // same as body
        // position of bone and direction to sample. World space
        for( let f in faceLocations ){
            let color = Math.random() * 0xffffff;
            let localDir = faceLocations[ f ];
            //like a matrix multiplication...
            worldDir.x = localDir.x * worldX.x + localDir.y * worldY.x + localDir.z * worldZ.x;
            worldDir.y = localDir.x * worldX.y + localDir.y * worldY.y + localDir.z * worldZ.y;
            worldDir.z = localDir.x * worldX.z + localDir.y * worldY.z + localDir.z * worldZ.z;
            worldDir.normalize();

            let dirSidesXOffset = worldX.clone().multiplyScalar( Math.cos( 85 * Math.PI/180 ) );
            worldDir.add( dirSidesXOffset ).add( dirSidesXOffset ); // start at SideLL and iteratively go to SideRR
            
            for ( let i = 0; i < sides.length; ++i ){
                // need to subtract worldY from direction. Only X-Z plane is desired. sphericalToEllipsoidal already does this.
                this.createBodyPoint( f + sides[i], this.skeleton.bones[ this.boneMap[ "Head" ] ].name, this.doRaycast( worldHeadPos, worldDir, true ), this.sphericalToEllipsoidal( worldDir ), color );
                worldDir.sub( dirSidesXOffset );
            }
        }
    }

    computeBodyLocations(){      
        let bodyLocations ={ // firs in array is the bone target. Rest of bones define the location (Average)
            "head": { tgBone: "Head", pos: [ "Head" ] },
            "neck": { tgBone: "Neck", pos: [ "Neck", "Neck", "Head" ] },
            "shoulderTop": { tgBone: "ShouldersUnion", pos: [ "LShoulder", "RShoulder", "Neck" ] },
            "shoulderLine": { tgBone: "ShouldersUnion", pos: [ "LShoulder", "RShoulder", "ShouldersUnion" ] },
            "shoulderL": { tgBone: "LShoulder", pos: [ "LArm" ] },
            "shoulderR": { tgBone: "RShoulder", pos: [ "RArm" ] },
            "chest": { tgBone: "ShouldersUnion", pos: [ "ShouldersUnion" ] },
            "stomach": { tgBone: "Stomach", pos: [ "Stomach" ] },
            "belowstomach": { tgBone: "BelowStomach", pos: [ "BelowStomach" ] },
            "neutral": { tgBone: "Hips", pos: [ "Hips" ] }
        }
        
        let worldPos = new THREE.Vector3(0,0,0);
        let worldDir = new THREE.Vector3(0,0,0);
        let _tempV3_0 = new THREE.Vector3(0,0,0);

        let sides = [ "_SideLL", "_SideL", "", "_SideR", "_SideRR" ]; // same as face
        // position of bone and direction to sample. World space
        for( let b in bodyLocations ){
            let color = Math.random() * 0xffffff;
            let boneName = this.skeleton.bones[ this.boneMap[ bodyLocations[b].tgBone ] ].name;
            
            worldPos.set(0,0,0);
            worldDir.set(0,0,0);
            // compute world point 
            let locs = bodyLocations[ b ].pos;
            for ( let i = 0; i < locs.length; ++i ){
                worldPos.add( this.skeleton.bones[ this.boneMap[ locs[i] ] ].getWorldPosition( new THREE.Vector3() ) );
            }
            worldPos.multiplyScalar( 1 / locs.length );

            let deltaAngle = 35 * Math.PI/180;
            let angle = 2*deltaAngle;
            // start at SideLL and iteratively go to SideRR
            for ( let i = 0; i < sides.length; ++i ){
                worldDir.copy( this.worldZ ).multiplyScalar( Math.cos( angle ) );
                let x = _tempV3_0.copy( this.worldX ).multiplyScalar( Math.sin( angle ) );
                worldDir.add( x ); 
                this.createBodyPoint( b + sides[i], boneName, this.doRaycast( worldPos, worldDir, true ), this.sphericalToEllipsoidal( worldDir ), color );
                angle -= deltaAngle;      
            }

        }
    }

    computeArmLocations( isLeft = false ){
        // directions are not in world nor in mesh coords. x*rightAxisMeshCoords, y*upAxisMeshCoords, z*frontAxisMeshCoords
        // assuming arms in t-pose and hands more less in t-pose + palm looking down
        let armLocations = {
            Hand: {
                tgBone: "Wrist", pos: [ "Wrist", "HandMiddle", "HandMiddle" ],
                dir: { Radial: { x:0, y:0, z:1 }, Ulnar: { x:0, y:0, z:-1 }, Back: { x:0, y:1, z:0 }, Palmar: { x:0, y:-1, z:0 } }
            },
            Wrist: {
                tgBone: "Wrist", pos: [ "Wrist" ],
                dir: { Radial: { x:0, y:0, z:1 }, Ulnar: { x:0, y:0, z:-1 }, Back: { x:0, y:1, z:0 }, Palmar: { x:0, y:-1, z:0 } }
            },
            Forearm: {
                tgBone: "Elbow", pos: [ "Wrist", "Elbow" ],
                dir: { Radial: { x:0, y:0, z:1 }, Ulnar: { x:0, y:0, z:-1 }, Back: { x:0, y:1, z:0 }, Palmar: { x:0, y:-1, z:0 } }
            },
            Elbow: {
                tgBone: "Arm",   pos: [ "Elbow" ],
                dir: { 
                    Left: { x:0, y:0, z: ( isLeft? -1 : 1 ) }, // different for left hand
                    Right: { x:0, y:0, z: ( isLeft? 1 : -1 ) }, // different for left hand
                    Back: { x:0, y:-1, z:0 }, Palmar: { x:0, y:1, z:0 } }
            },
            Upperarm: {
                tgBone: "Arm",   pos: [ "Elbow", "Arm" ],
                dir: { 
                    Left: { x:0, y:0, z: ( isLeft? -1 : 1 ) }, // different for left hand
                    Right: { x:0, y:0, z: ( isLeft? 1 : -1 ) }, // different for left hand
                    Back: { x:0, y:-1, z:0 }, Palmar: { x:0, y:1, z:0 } }
            }
        }
        
        // compute front, up, right in scene world coordinates. Use root as the one defining the rotation difference from bind
        let worldZ = this.worldZ;
        let worldY = this.worldY;
        let worldX = this.worldX;

        let worldPos = new THREE.Vector3(0,0,0);
        let worldDir = new THREE.Vector3(0,0,0);
        
        // position of bone and direction to sample. World space
        for( let l in armLocations ){
            let color = Math.random() * 0xffffff;
            let location = armLocations[l];
            for ( let d in location.dir ){
                let boneName = this.skeleton.bones[ this.boneMap[ (isLeft?"L":"R") + location.tgBone ] ].name;
                worldPos.set(0,0,0);
                worldDir.set(0,0,0);
                // compute world point 
                let locs = location.pos;
                for ( let i = 0; i < locs.length; ++i ){
                    worldPos.add( this.skeleton.bones[ this.boneMap[ (isLeft?"L":"R") + locs[i] ] ].getWorldPosition( new THREE.Vector3() ) );
                }
                worldPos.multiplyScalar( 1 / locs.length );

                //like a matrix multiplication...
                let localDir = location.dir[d];
                worldDir.x = localDir.x * worldX.x + localDir.y * worldY.x + localDir.z * worldZ.x;
                worldDir.y = localDir.x * worldX.y + localDir.y * worldY.y + localDir.z * worldZ.y;
                worldDir.z = localDir.x * worldX.z + localDir.y * worldY.z + localDir.z * worldZ.z;
                worldDir.normalize();

                this.createHandPoint( isLeft, l + d, boneName, this.doRaycast( worldPos, worldDir, false ), color );
            }
        }
    }

    computeHandLocations( isLeft = false ){
        let wrist = this.boneMap[ (isLeft?"L":"R") + "Wrist" ];
        let fingerbases = [ this.boneMap[ (isLeft?"L":"R") + "HandIndex" ], this.boneMap[ (isLeft?"L":"R") + "HandMiddle" ], this.boneMap[ (isLeft?"L":"R") + "HandRing" ], this.boneMap[ (isLeft?"L":"R") + "HandPinky" ] ];
        
        // compute front, up, right in scene world coordinates. Use root as the one defining the rotation difference from bind
        let worldZ = this.worldZ;
        let worldY = this.worldY;

        let worldWristPos = new THREE.Vector3(0,0,0);
        let worldPos = new THREE.Vector3(0,0,0);
        let worldDir = new THREE.Vector3(0,0,0);
        let _tempV3_0 = new THREE.Vector3(0,0,0);
        this.skeleton.bones[ wrist ].getWorldPosition( worldWristPos );
        let color;

        for( let i = 0; i < fingerbases.length; ++i){
            // base of finger
            color = Math.random() * 0xffffff;
            this.skeleton.bones[ fingerbases[i] ].getWorldPosition( worldPos );            
            let boneName = this.skeleton.bones[ fingerbases[i] ].name;
            this.createHandPoint( isLeft, (i+2) + "BaseBack", boneName, this.doRaycast( worldPos, worldY, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "BasePalmar", boneName, this.doRaycast( worldPos, worldDir.copy( worldY ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            
            this.skeleton.bones[ fingerbases[i]+1 ].getWorldPosition(_tempV3_0 );
            worldPos.lerpVectors( worldPos, _tempV3_0, 0.35 );
            this.createHandPoint( isLeft, (i+2) + "BaseRadial", boneName, this.doRaycast( worldPos, worldZ, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "BaseUlnar", boneName, this.doRaycast( worldPos, worldDir.copy( worldZ ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
          
            // mid finger
            color = Math.random() * 0xffffff;
            this.skeleton.bones[ fingerbases[i]+1 ].getWorldPosition( worldPos );            
            boneName = this.skeleton.bones[ fingerbases[i]+1 ].name;
            this.createHandPoint( isLeft, (i+2) + "MidBack", boneName, this.doRaycast( worldPos, worldY, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "MidPalmar", boneName, this.doRaycast( worldPos, worldDir.copy( worldY ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "MidRadial", boneName, this.doRaycast( worldPos, worldZ, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "MidUlnar", boneName, this.doRaycast( worldPos, worldDir.copy( worldZ ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            
            // PAD
            color = Math.random() * 0xffffff;
            this.skeleton.bones[ fingerbases[i]+2 ].getWorldPosition( worldPos );            
            this.skeleton.bones[ fingerbases[i]+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
            worldPos.lerpVectors( worldPos, _tempV3_0, 0.5 );
            boneName = this.skeleton.bones[ fingerbases[i]+2 ].name;
            this.createHandPoint( isLeft, (i+2) + "PadBack", boneName, this.doRaycast( worldPos, worldY, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "PadPalmar", boneName, this.doRaycast( worldPos, worldDir.copy( worldY ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "PadRadial", boneName, this.doRaycast( worldPos, worldZ, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "PadUlnar", boneName, this.doRaycast( worldPos, worldDir.copy( worldZ ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
           
            //Tip
            this.skeleton.bones[ fingerbases[i]+2 ].getWorldPosition( worldPos );            
            this.skeleton.bones[ fingerbases[i]+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
            worldDir.subVectors(  _tempV3_0, worldPos ).normalize();
            boneName = this.skeleton.bones[ fingerbases[i]+2 ].name;
            this.createHandPoint( isLeft, (i+2) + "Tip", boneName, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
        }


        // Thumb
        let thumbidx = this.boneMap[ (isLeft?"L":"R") + "HandThumb"];
        let s = [ "1Base", "1Mid", "1Pad"];
        for ( let i = 0; i < 3; ++i){ 
            color = Math.random() * 0xffffff;
            let boneName = this.skeleton.bones[ thumbidx + i ].name;
            this.skeleton.bones[ thumbidx + i ].getWorldPosition( worldPos );            
            this.skeleton.bones[ thumbidx + i + 1 ].getWorldPosition( _tempV3_0 );            
            _tempV3_0.subVectors( _tempV3_0, worldPos ).normalize();
            worldDir.crossVectors( _tempV3_0, worldZ ).normalize();
            this.createHandPoint( isLeft, s[i] + "Ulnar", boneName, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( isLeft, "ThumbballUlnar", boneName, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
            this.createHandPoint( isLeft, s[i] + "Radial", boneName, this.doRaycast( worldPos, worldDir.multiplyScalar(-1), false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( isLeft, "ThumbballRadial", boneName, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
        
            worldDir.crossVectors( worldDir, _tempV3_0 ).normalize();
            this.createHandPoint( isLeft, s[i] + "Back", boneName, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( isLeft, "ThumbballBack", boneName, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
            this.createHandPoint( isLeft, s[i] + "Palmar", boneName, this.doRaycast( worldPos, worldDir.multiplyScalar(-1), false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( isLeft, "ThumbballPalmar", boneName, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
        }
        
        // thumb Tip
        this.skeleton.bones[ thumbidx+2 ].getWorldPosition( worldPos );            
        this.skeleton.bones[ thumbidx+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
        worldDir.subVectors(  _tempV3_0, worldPos ).normalize();
        let boneName = this.skeleton.bones[ thumbidx+2 ].name;
        this.createHandPoint( isLeft, "Tip", boneName, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
    }


    // position inside the mesh. Direction outwards. Returns null or the outermost point in the mesh in world coordinates
    doRaycast( worldPos, dir, computeOutermostPoint = false ){

        if ( computeOutermostPoint ){
            // detect the outermost layer of the mesh
            this.rayDir.copy( dir ).multiplyScalar( 10000 );
            this.rayOr.copy( worldPos ).add( this.rayDir );
            this.rayDir.copy( dir ).multiplyScalar( -1 );
        }else{    
            this.rayDir.copy( dir );
            this.rayOr.copy( worldPos );
        }
        this.rayDir.normalize();
    
        this.raycaster.set( this.rayOr, this.rayDir );
        let intersections = this.raycaster.intersectObjects( this.model.children, true ); //window.global.app.scene.children, true);

        if( intersections && intersections.length ){          
            // many intersections may be returned (even arrowhelpers, gridhelpers). Take only meshes from the glb 
            for ( let i = 0; i < intersections.length; ++i ){
                if ( intersections[i].object && ( intersections[i].object.isMesh || intersections[i].object.isSkinnedMesh ) ){ 
                    return intersections[i].point.clone(); // intersection returns world space
                }
            }
        }
        return null;
    }

    exportJSON(){
        // [ bone assigned, position in mesh coordinates, direction in mesh coordinates ]
        let result = {};
        result.axes = [ this.rightAxisMeshCoords.clone(), this.upAxisMeshCoords.clone(), this.frontAxisMeshCoords.clone() ];
        result.bodyLocations = {};
        for ( let a in this.points.body ){
            let o = this.points.body[a];
            result.bodyLocations[ o.name ] = [ o.boneAssigned, o.wpos.clone().applyMatrix4( this.meshToWorldMat4Inv ), o.wdir.clone().applyMatrix3( this.meshToWorldMat3Inv ) ];
        }
        result.handLocationsL = {};
        for ( let a in this.points.handL ){
            let o = this.points.handL[a];
            result.handLocationsL[ o.name ] = [ o.boneAssigned, o.wpos.clone().applyMatrix4( this.meshToWorldMat4Inv ) ];
        }
        result.handLocationsR = {};
        for ( let a in this.points.handR ){
            let o = this.points.handR[a];
            result.handLocationsR[ o.name ] = [ o.boneAssigned, o.wpos.clone().applyMatrix4( this.meshToWorldMat4Inv ) ];
        }
        return result;
    }
}


class ConfigPoint extends THREE.Group {
    static _CT_SPHERE_SIZE = 0.01; 
    constructor( configData ){
        super();
        let color = configData.color;
        if ( isNaN(color) || color == null ){ color = Math.random() * 0xffffff; }
        this.configInfo = { data: configData, sphere: null, arrow: null };

        this.name = configData.name;
        this.position.copy( configData.wpos );

        let sphere = this.configInfo.sphere = new THREE.Mesh( new THREE.SphereGeometry(ConfigPoint._CT_SPHERE_SIZE,16,16), new THREE.MeshStandardMaterial( { depthWrite:true, depthTest:true, color: color } ) );
        sphere.position.set( 0,0,0 );
        this.add(sphere);
        
        // arrow for direction purposes. BodyLocation and FaceLocation
        let arrow = this.configInfo.arrow = new THREE.ArrowHelper();
        arrow.setColor( color );
        arrow.setLength( 0.10, 0.05, ConfigPoint._CT_SPHERE_SIZE );
        arrow.setDirection({x:0,y:0,z:1}); // facing +z locally so lookAt can be used on configPoint
        this.add( arrow );
        if ( configData.wdir ){ this.setDir( configData.wdir ); }
        else{ arrow.visible = false;}

    }

    // different from clone() which is from threejs
    clonePoint(){
        return new ConfigPoint( this.configInfo.data );
    }

    getDir( result ){ 
        if ( !this.configInfo.arrow.visible ){ return null; }
        if( !result ){ result = new THREE.Vector3(); }
        result.set( 0,0,1 ).applyQuaternion( this.quaternion );
        return result;
    }

    getPos( result ){
        if( !result ){ result = new THREE.Vector3(); }
        result.copy( this.position );
        return result;
    }

    getName(){ return this.configInfo.data.name; }
    getBoneAssigned(){ return this.configInfo.data.boneAssigned; }

    // if null arrow is disable
    setDir( wdir ){
        if ( !wdir || !this.configInfo.arrow.visible ){ return; }
        let lookAtPos = this.position.clone();
        lookAtPos.add( wdir );
        this.lookAt( lookAtPos ); // rotate entire group
        this.getDir( this.configInfo.data.wdir );
    }

    setPos( wpos ){
        this.position.copy( wpos );
        this.getPos( this.configInfo.data.wpos );
    }

    setBoneAssigned( boneAssigned ) { this.configInfo.data.boneAssigned = boneAssigned; }

}


class ConfigurerHelper {
    constructor( configurer, camera ){
        this.configurer = configurer;
        this.scene = this.configurer.scene;
        this.camera = camera;
        this.bone = this.configurer.skeleton.bones[ this.configurer.boneMap.Hips ];
        this.mouse = { x: 0, y:0 }
        this.pointsScale = 1;
        
        this.hoverModeData = { p: null, lock: false };
        this.meshModeData = { 
            p: new ConfigPoint( {name: "test", boneAssigned:0, wpos: new THREE.Vector3(0,0,0), wdir: new THREE.Vector3(0,0,1), color: 0xff0000 } ), 
            lock: false
        };
        this.scene.add( this.meshModeData.p );

        this.points = {};
        this.computePoints();

        this.mode = 0; // 0 none, 1 hover, 2 mesh intersect
    }

    deletePointsFromList( list ){
        for( let p in list ){
            disposeObjectSafeThreejs( list[p] );
        } 
        list = [];
    }
    deleteAllPoints(){
        for ( let a in this.points ){
            this.deleteAllPoints( this.points[a] );
        }
    }

    computePoints( ){
        for ( let a in this.configurer.points ){
            let list = this.configurer.points[a];
            let resultArray = this.points[ a ] = [];
            for( let p in list ){
                let point = new ConfigPoint( list[p] );
                resultArray.push( point );
                this.scene.add( point );
            }
        }
    }

    setScale( s ){
        this.pointsScale = s;
        for ( let a in this.points ){
            let list = this.points[a];
            for ( let p = 0; p < list.length; ++p ){
                list[p].scale.set( s,s,s );
            }
        }
    }

    rayPointsIntersect( rayOr, rayDir ){
        let _tempV3_0 = new THREE.Vector3();
        let _tempV3_1 = new THREE.Vector3();
        let normRayDir = ( new THREE.Vector3() ).copy( rayDir ).normalize();

        let rayPointDistSq = ConfigPoint._CT_SPHERE_SIZE * this.pointsScale;
        rayPointDistSq = rayPointDistSq * rayPointDistSq;

        let result = { dist:999999, rayT: 99999999, point: null };
        for ( let a in this.points ){
            let points = this.points[a];
            for ( let p = 0; p < points.length; ++p ){
                _tempV3_0.subVectors( points[p].position, rayOr );
                let projectionIntoRay = _tempV3_0.dot( normRayDir );
                _tempV3_1.copy( normRayDir ).multiplyScalar( projectionIntoRay );
                let rejection = _tempV3_0.subVectors( _tempV3_0, _tempV3_1 );
                if( rejection.lengthSq() < rayPointDistSq && projectionIntoRay < result.rayT ){
                    result.rayT = projectionIntoRay;
                    result.point = points[p];
                    result.dist = rejection.length();
                }
            }
        }

        return result;
    }

    toggleLockMode(){
        if ( this.mode == 1 ){ this.hoverModeData.lock = !this.hoverModeData.lock; }
        else if ( this.mode == 2 ){ this.meshModeData.lock = !this.meshModeData.lock; }
    }
    setLockMode( lock = false ){
        if ( this.mode == 1 ){ this.hoverModeData.lock = !!lock; }
        else if ( this.mode == 2 ){ this.meshModeData.lock = !!lock; }
    }


    setHover( rayOr, rayDir ){
        if ( this.hoverModeData.lock ){ return; }    
        
        let result = this.rayPointsIntersect( rayOr, rayDir );
        if ( this.hoverModeData.p ){ this.hoverModeData.p.scale.set( this.pointsScale, this.pointsScale, this.pointsScale ); }
        this.hoverModeData.p = null;
        if ( result.point ){
            result.point.scale.set( this.pointsScale*2, this.pointsScale*2, this.pointsScale*2 );
            this.hoverModeData.p = result.point;
        }
    }

    setMeshIntersect( rayOr, rayDir ){
        if ( this.meshModeData.lock ){ return; }

        let result = this.configurer.doRaycast( rayOr, rayDir );
        
        if ( result ){
            this.meshModeData.p.setPos( result );
            this.bone = this.configurer.skeleton.bones[ this.configurer.boneMap.Hips ];
            
            let bonePos = this.bone.getWorldPosition( new THREE.Vector3() );
            let dir = new THREE.Vector3();
            dir.subVectors( result, bonePos );
            dir.projectOnPlane( this.configurer.worldY );

            dir = this.configurer.sphericalToEllipsoidal( dir )
            this.meshModeData.p.setDir( dir );
        }
    }
    update(){
        let rayDir = new THREE.Vector3( this.mouse.x, this.mouse.y, -1); 
        rayDir.applyMatrix4( this.camera.projectionMatrixInverse ).applyMatrix4( this.camera.matrixWorld );
        rayDir.subVectors( rayDir, this.camera.position ).normalize(); 
        
        if ( this.mode == 1 ){ this.setHover( this.camera.position, rayDir ); }
        if ( this.mode == 2 ){ this.setMeshIntersect( this.camera.position, rayDir ); }
    }


}
export{ Configurer, ConfigurerHelper };