import * as THREE from "three"
import { disposeObjectSafeThreejs, findIndexOfBone, objectConcat } from "./Utils.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";



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
        this.skeleton.pose(); // set on bind pose
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
        this.upAxisMeshCoords.crossVectors( this.frontAxisMeshCoords, this.rightAxisMeshCoords ).normalize();

        this.worldZ = this.frontAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        this.worldY = this.upAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        this.worldX = this.rightAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();

    }

    computeFingerAxes(){
        this.fingerAxes = { 
            R: { bends: [], splays: [], quats: [] }, 
            L: { bends: [], splays: [], quats: [] } 
        };
        let bones = this.skeleton.bones;
        let bendAxis = new THREE.Vector3();
        let splayAxis = new THREE.Vector3();
        let fingerDir = new THREE.Vector3();

        let tempM3_0 = new THREE.Matrix3();
        let tempV3_0 = new THREE.Vector3();
        let tempV3_1 = new THREE.Vector3();


        let thumb = this.boneMap.RHandThumb;
        let index = this.boneMap.RHandIndex;
        let middle = this.boneMap.RHandMiddle;
        let ring = this.boneMap.RHandRing;
        let pinky = this.boneMap.RHandPinky;
        let fingerAxesHand = this.fingerAxes.R; 

        while( true ){  // do it for both hands
            // thumb
            for ( let i = 0; i < 3; ++i ){
                tempM3_0.setFromMatrix4( bones[ thumb + i ].matrixWorld ).invert();
                bones[ thumb + i ].getWorldPosition( tempV3_0 );
                bones[ thumb + i + 1 ].getWorldPosition( fingerDir );
                fingerDir.subVectors( fingerDir, tempV3_0 ).normalize(); // finger direction 
                bendAxis.crossVectors( this.worldZ, fingerDir ).normalize(); // assuming Tpose. Reversed from finger computation
                fingerAxesHand.bends.push( bendAxis.clone().applyMatrix3( this.meshToWorldMat3Inv ).normalize() ); // from world to mesh space
                // let arrow = new THREE.ArrowHelper( bendAxis, tempV3_0, 0.1, 0xff0000 ); this.scene.add( arrow );
                fingerAxesHand.quats.push( bones[ thumb + i ].quaternion.clone() );
                if ( i == 0 ){
                    splayAxis.crossVectors( bendAxis, fingerDir ).normalize(); // assuming Tpose
                    if ( fingerAxesHand == this.fingerAxes.R ){ splayAxis.multiplyScalar( -1 ); }
                    // let arrow = new THREE.ArrowHelper( splayAxis, tempV3_0, 0.1, 0x00ff00 ); this.scene.add( arrow );
                    fingerAxesHand.splays.push( splayAxis.clone().applyMatrix3( this.meshToWorldMat3Inv ).normalize() ); // from world to mesh space    
                }
                if ( i == 0 ){
                    //assuming bones are in bind pose
                    // compute quat so thumb is straight and parallel to fingers instead of whatever pose it is in the mesh
                    let completeThumbDir = new THREE.Vector3();
                    bones[ thumb + i ].getWorldPosition( tempV3_0 );
                    bones[ thumb + i + 3 ].getWorldPosition( tempV3_1 );
                    completeThumbDir.subVectors( tempV3_1, tempV3_0 ).normalize();

                    let completeMiddleFingerDir = new THREE.Vector3();
                    bones[ middle + i ].getWorldPosition( tempV3_0 );
                    bones[ middle + i + 3 ].getWorldPosition( tempV3_1 );
                    completeMiddleFingerDir.subVectors( tempV3_1, tempV3_0 ).normalize();
                    completeMiddleFingerDir.multiplyScalar( Math.cos(60*Math.PI/180) ).addScaledVector( this.worldZ, Math.sin(60*Math.PI/180) );
                    let tempQ = new THREE.Quaternion();
                    let resultQ = new THREE.Quaternion();

                    let thumbProjection = { x: bendAxis.dot(completeThumbDir), y: splayAxis.dot(completeThumbDir), z: fingerDir.dot(completeThumbDir) };
                    let middleProjection = { x: bendAxis.dot(completeMiddleFingerDir), y: splayAxis.dot(completeMiddleFingerDir), z: fingerDir.dot(completeMiddleFingerDir) };

                    let thumbAngles = { elevation: - Math.asin( thumbProjection.y ), bearing: Math.atan2( thumbProjection.x, thumbProjection.z) };
                    let middleAngles = { elevation: - Math.asin( middleProjection.y ), bearing: Math.atan2( middleProjection.x, middleProjection.z) };

                    let afterBindSplayAxis = splayAxis.clone().applyMatrix3( tempM3_0 ).applyQuaternion( bones[ thumb ].quaternion ).normalize();
                    let afterBindBendAxis = bendAxis.clone().applyMatrix3( tempM3_0 ).applyQuaternion( bones[ thumb ].quaternion ).normalize();

                    resultQ.set(0,0,0,1);
                    resultQ.premultiply( tempQ.setFromAxisAngle( afterBindSplayAxis, -thumbAngles.bearing    * (fingerAxesHand == this.fingerAxes.L ? -1 : 1) ) );
                    resultQ.premultiply( tempQ.setFromAxisAngle( afterBindBendAxis,  -thumbAngles.elevation  * (fingerAxesHand == this.fingerAxes.L ? -1 : 1) ) );
                    resultQ.premultiply( tempQ.setFromAxisAngle( afterBindBendAxis,   middleAngles.elevation * (fingerAxesHand == this.fingerAxes.L ? -1 : 1) ) );
                    resultQ.premultiply( tempQ.setFromAxisAngle( afterBindSplayAxis,  middleAngles.bearing   * (fingerAxesHand == this.fingerAxes.L ? -1 : 1) ) );
                    resultQ.normalize();

                    fingerAxesHand.quats[ fingerAxesHand.quats.length - 1 ].premultiply( resultQ ).normalize();
                }
            }
            // fingers - no thumb
            let fingers = [ index, middle, ring, pinky ];
            let bendBaseTweak = [ - Math.sin(6*Math.PI/180), 0, Math.sin(6*Math.PI/180), Math.sin(7*Math.PI/180) ];
            for ( let f = 0; f < fingers.length; ++f ){
                bones[ fingers[f] ].getWorldPosition( tempV3_0 );
                bones[ fingers[f] + 2 ].getWorldPosition( fingerDir );
                fingerDir.subVectors( fingerDir, tempV3_0 ).normalize(); // finger direction 
                splayAxis.crossVectors( fingerDir, this.worldZ ).normalize(); // assuming Tpose
                bendAxis.crossVectors( splayAxis, fingerDir ).normalize(); // assuming Tpose
                for ( let i = 0; i < 3; ++i ){
                    let bendLocal = bendAxis.clone(); 
                    tempM3_0.setFromMatrix4( bones[ fingers[f] + i ].matrixWorld ).invert();
                    if ( i == 0 ){
                        fingerAxesHand.splays.push( splayAxis.clone().applyMatrix3( this.meshToWorldMat3Inv ).normalize() ); // from world to mesh space    
                        // let arrow = new THREE.ArrowHelper( splayAxis, tempV3_0, 0.1, 0x00ff00 ); this.scene.add( arrow );
                        bendLocal.multiplyScalar( 1 - Math.abs( bendBaseTweak[f] ) ).addScaledVector( fingerDir, bendBaseTweak[f] );
                    }
                    if ( fingerAxesHand == this.fingerAxes.L ){ bendLocal.multiplyScalar( -1 ); }
                    // let arrow = new THREE.ArrowHelper( bendLocal, bones[ fingers[f] + i ].getWorldPosition( tempV3_0 ), 0.1, 0xff0000 ); this.scene.add( arrow );
                    bendLocal.applyMatrix3( this.meshToWorldMat3Inv ).normalize(); // from world to mesh space
                    fingerAxesHand.bends.push( bendLocal ); // from world to local space
                    fingerAxesHand.quats.push( bones[ fingers[f] + i ].quaternion.clone() );
                }
            }

            if ( fingerAxesHand == this.fingerAxes.L ){ break; }
            thumb = this.boneMap.LHandThumb;
            index = this.boneMap.LHandIndex;
            middle = this.boneMap.LHandMiddle;
            ring = this.boneMap.LHandRing;
            pinky = this.boneMap.LHandPinky;
            fingerAxesHand = this.fingerAxes.L; 

        }
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

        this.computeFingerAxes();
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
    _createPoint( list, name, boneAssigned, boneSrcPos, wpos, wdir = null, color = null ){
        if ( !list || !wpos || this._findPointInList( list, name ) ){ return null; }
        list.push( { name: name, boneAssigned: boneAssigned, boneSrcPos: new THREE.Vector3(boneSrcPos.x,boneSrcPos.y,boneSrcPos.z), wpos: new THREE.Vector3(wpos.x,wpos.y,wpos.z), wdir: wdir? new THREE.Vector3(wdir.x,wdir.y,wdir.z) : null , color: color } );
    }

    createHandPoint( isLeft, name, boneAssigned, boneSrcPos, wpos, color = null ){
        let destList = isLeft? this.points.handL : this.points.handR;
        return this._createPoint( destList, name, boneAssigned, boneSrcPos, wpos, null, color );
    }

    createBodyPoint( name, boneAssigned, boneSrcPos, wpos, wdir, color = null ){
        return this._createPoint( this.points.body, name, boneAssigned, boneSrcPos, wpos, wdir, color );
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

    /**
     * based on the 3d spherical dir, the ellipsoidal direction is computed. Only the X & Z axes are used. The Y is automatically discarded
     * Returns new THREE.Vector3
     */ 
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
                this.createBodyPoint( f + sides[i], this.skeleton.bones[ this.boneMap[ "Head" ] ].name, worldHeadPos, this.doRaycast( worldHeadPos, worldDir, true ), this.sphericalToEllipsoidal( worldDir ), color );
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
            "shoulderL": { tgBone: "ShouldersUnion", pos: [ "LArm" ] },
            "shoulderR": { tgBone: "ShouldersUnion", pos: [ "RArm" ] },
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
                this.createBodyPoint( b + sides[i], boneName, worldPos, this.doRaycast( worldPos, worldDir, true ), this.sphericalToEllipsoidal( worldDir ), color );
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
                    Back: { x:0, y:-1, z:0 }, Front: { x:0, y:1, z:0 } }
            },
            Upperarm: {
                tgBone: "Arm",   pos: [ "Elbow", "Arm" ],
                dir: { 
                    Left: { x:0, y:0, z: ( isLeft? -1 : 1 ) }, // different for left hand
                    Right: { x:0, y:0, z: ( isLeft? 1 : -1 ) }, // different for left hand
                    Back: { x:0, y:-1, z:0 }, Front: { x:0, y:1, z:0 } }
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

                this.createHandPoint( isLeft, l + d, boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color );
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
            this.createHandPoint( isLeft, (i+2) + "BaseBack", boneName, worldPos, this.doRaycast( worldPos, worldY, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "BasePalmar", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( worldY ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            
            this.skeleton.bones[ fingerbases[i]+1 ].getWorldPosition(_tempV3_0 );
            worldPos.lerpVectors( worldPos, _tempV3_0, 0.5 );
            this.createHandPoint( isLeft, (i+2) + "BaseRadial", boneName, worldPos, this.doRaycast( worldPos, worldZ, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "BaseUlnar", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( worldZ ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
          
            // mid finger
            color = Math.random() * 0xffffff;
            this.skeleton.bones[ fingerbases[i]+1 ].getWorldPosition( worldPos );            
            boneName = this.skeleton.bones[ fingerbases[i]+1 ].name;
            this.createHandPoint( isLeft, (i+2) + "MidBack", boneName, worldPos, this.doRaycast( worldPos, worldY, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "MidPalmar", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( worldY ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "MidRadial", boneName, worldPos, this.doRaycast( worldPos, worldZ, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "MidUlnar", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( worldZ ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            
            // PAD
            color = Math.random() * 0xffffff;
            this.skeleton.bones[ fingerbases[i]+2 ].getWorldPosition( worldPos );            
            this.skeleton.bones[ fingerbases[i]+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
            worldPos.lerpVectors( worldPos, _tempV3_0, 0.5 );
            boneName = this.skeleton.bones[ fingerbases[i]+2 ].name;
            this.createHandPoint( isLeft, (i+2) + "PadBack", boneName, worldPos, this.doRaycast( worldPos, worldY, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "PadPalmar", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( worldY ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "PadRadial", boneName, worldPos, this.doRaycast( worldPos, worldZ, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "PadUlnar", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( worldZ ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
           
            //Tip
            this.skeleton.bones[ fingerbases[i]+2 ].getWorldPosition( worldPos );            
            this.skeleton.bones[ fingerbases[i]+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
            worldDir.subVectors(  _tempV3_0, worldPos ).normalize();
            boneName = this.skeleton.bones[ fingerbases[i]+2 ].name;
            this.createHandPoint( isLeft, (i+2) + "Tip", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
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
            this.createHandPoint( isLeft, s[i] + "Ulnar", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( isLeft, "ThumbballUlnar", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
            this.createHandPoint( isLeft, s[i] + "Radial", boneName, worldPos, this.doRaycast( worldPos, worldDir.multiplyScalar(-1), false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( isLeft, "ThumbballRadial", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
        
            worldDir.crossVectors( worldDir, _tempV3_0 ).normalize();
            this.createHandPoint( isLeft, s[i] + "Back", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( isLeft, "ThumbballBack", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
            this.createHandPoint( isLeft, s[i] + "Palmar", boneName, worldPos, this.doRaycast( worldPos, worldDir.multiplyScalar(-1), false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( isLeft, "ThumbballPalmar", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
        }
        
        // thumb Tip
        this.skeleton.bones[ thumbidx+2 ].getWorldPosition( worldPos );            
        this.skeleton.bones[ thumbidx+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
        worldDir.subVectors(  _tempV3_0, worldPos ).normalize();
        let boneName = this.skeleton.bones[ thumbidx+2 ].name;
        this.createHandPoint( isLeft, "1Tip", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
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
        let intersections = this.raycaster.intersectObjects( this.model.children, true );

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

        result.fingerAxes = JSON.parse( JSON.stringify( this.fingerAxes , (key,value)=>{
            if ( value.isQuaternion ){ return { x:value.x, y:value.y, z:value.z, w:value.w } }
            else if ( typeof( value ) == "number" ){ return Number( value.toFixed(6) ); }
            else{ return value; }
        } ) );
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
    getBoneSrcPos(){ return this.configInfo.data.boneSrcPos; } // from where the raycast was computed
    getColor(){ return this.configInfo.sphere.material.color; }

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
    setColor( color ){ 
        this.configInfo.data.color = color; 
        this.configInfo.sphere.material.color = color; 
        this.configInfo.arrow.setColor( new THREE.Color(color) ); 
    }
}


class ConfigurerHelper {
    static _E_MODES = { NONE: 0, HOVER: 1, EDIT: 3 };
    constructor( configurer, camera, canvasDom ){
        this.configurer = configurer;
        this.mode = ConfigurerHelper._E_MODES.HOVER;
        
        this.baseThreejsGroup = new THREE.Group();
        this.baseThreejsGroup.position.set(0,0,0);
        this.configurer.scene.add( this.baseThreejsGroup );

        this.camera = camera;
        this.mouse = { x: 0, y:0 }
        this.pointsScale = 1;
        
        this.hoverModeData = { p: null };
        this.editModeData = {
            p: new ConfigPoint( {name: "editMode", boneAssigned:0, wpos: new THREE.Vector3(0,0,0), wdir: new THREE.Vector3(0,0,1), color: 0x0000ff } ), 
            pointSelected: null,
            frozen: false, // when on edit, disables the point updates. Useful to keep the point static wihtout commiting results 
            mode: 0, /* mode: mesh intersection (0), translate guizmo (1), rotate guizmo (2) */
        }

        this.baseThreejsGroup.add( this.editModeData.p );

        this.transformControls = new TransformControls( this.camera, canvasDom );
        this.transformControls.attach( this.editModeData.p );
        this.configurer.scene.add( this.transformControls );

        this.setEditMode(0);

        this.points = {};
        this.computePoints();

    }

    dispose(){
        this.deleteAllPoints();
        disposeObjectSafeThreejs( this.baseThreejsGroup );
    }

    deletePointsFromList( list ){
        for( let p in list ){
            disposeObjectSafeThreejs( list[p] );
        } 
        list = [];
    }
    deleteAllPoints(){
        for ( let a in this.points ){
            this.deletePointsFromList( this.points[a] );
            this.points[a] = [];
        }
    }

    computePoints( ){
        this.deleteAllPoints();
        for ( let a in this.configurer.points ){
            let list = this.configurer.points[a];
            let resultArray = this.points[ a ] = [];
            for( let p = 0; p < list.length; ++p){
                let point = new ConfigPoint( list[p] );
                resultArray.push( point );
                this.baseThreejsGroup.add( point );
            }
        }
        // this.setVisibility( false );

    }

    setScale( s ){
        this.pointsScale = s;
        for ( let a in this.points ){
            let list = this.points[a];
            for ( let p = 0; p < list.length; ++p ){
                list[p].scale.set( s,s,s );
            }
        }

        this.editModeData.p.scale.set(s,s,s);
    }

    toggleVisibility(){
        this.baseThreejsGroup.visible = !this.baseThreejsGroup.visible;
    }
    setVisibility( pointsVisibility ){
        this.baseThreejsGroup.visible = !!pointsVisibility;
    }

    // when on edit mode, the user can edit using ray-mesh (0), gizmo translate (1), gizmo rotate (2)
    setEditMode( editMode = 0 ){
        switch( editMode ){
            case 0: 
                this.transformControls.showX = false;
                this.transformControls.showY = false;
                this.transformControls.showZ = false;
                this.transformControls.enabled = false;
                break;
            case 1: 
                this.transformControls.setMode("translate");
                this.transformControls.showX = true;
                this.transformControls.showY = true;
                this.transformControls.showZ = true;
                this.transformControls.enabled = !this.editModeData.frozen;
                break;
            case 2:
                this.transformControls.setMode("rotate");
                this.transformControls.showX = true;
                this.transformControls.showY = true;
                this.transformControls.showZ = true;
                this.transformControls.enabled = !this.editModeData.frozen;
                break;
            default: 
                return; 
                break; 
        }
        this.editModeData.mode = editMode;
    }

    selectToEdit( point ){
        if( !point ){ return false; }
        this.cancelEdit(); // just in case
        this.editModeData.pointSelected = point;
        this.editModeData.p.setPos( this.editModeData.pointSelected.getPos() );
        this.editModeData.p.setDir( this.editModeData.pointSelected.getDir() );
        this.editModeData.p.visible = true;
        point.visible = false;

        this.editModeData.frozen = false;
        this.setEditMode( this.editModeData.mode ); // enable and show transform gizmo if necessary

        // cancel any hover present
        if ( this.hoverModeData.p ){
            this.hoverModeData.p.scale.set( this.pointsScale, this.pointsScale, this.pointsScale );
            this.hoverModeData.p = null;
        }        
        this.mode = ConfigurerHelper._E_MODES.EDIT;
        return true;
    }

    selectToEditFromHover(){ return this.selectToEdit( this.hoverModeData.p ); }
    
    commitEdit(){
        if ( this.editModeData.pointSelected ){ 
            this.editModeData.pointSelected.setPos( this.editModeData.p.getPos() );
            this.editModeData.pointSelected.setDir( this.configurer.sphericalToEllipsoidal( this.editModeData.p.getDir() ) );
        }
        return this.cancelEdit();
    }

    // todo: maybe rename to setToHover or similar
    cancelEdit(){
        this.mode = ConfigurerHelper._E_MODES.HOVER;
        
        // hide gizmo
        this.transformControls.showX = false;
        this.transformControls.showY = false;
        this.transformControls.showZ = false;
        this.transformControls.enabled = false;
        this.editModeData.p.visible = false;
        
        // cancel changes to point selected and deattach
        if ( this.editModeData.pointSelected ){             
            this.editModeData.pointSelected.visible = true;
            this.editModeData.pointSelected = null;
            return true; 
        }

        return false;
    }

    toggleFreezeEdit(){ this.setFreezeEdit( !this.editModeData.frozen ); }
    setFreezeEdit( freeze = false ){ 
        if ( this.mode == ConfigurerHelper._E_MODES.EDIT && this.editModeData.pointSelected ){
            this.editModeData.frozen = !!freeze; 
            this.transformControls.enabled = !freeze;
        }
    }


    getPointHovered(){ return this.hoverModeData.p; }
    getPointSelected(){ return this.editModeData.pointSelected; }
    getMode(){ return this.mode; }


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

    updateHover( rayOr, rayDir ){
        if ( this.hoverModeData.p ){ this.hoverModeData.p.scale.set( this.pointsScale, this.pointsScale, this.pointsScale ); }
        this.hoverModeData.p = null;
        let result = this.rayPointsIntersect( rayOr, rayDir );
        if ( result.point ){
            result.point.scale.set( this.pointsScale*2, this.pointsScale*2, this.pointsScale*2 );
            this.hoverModeData.p = result.point;
        }
    }

    updateEdit( rayOr, rayDir ){
        if ( !this.editModeData.pointSelected ){ 
            this.mode = ConfigurerHelper._E_MODES.HOVER; 
            return; 
        }

        // update only if on "mesh intersect" mode
        if ( this.editModeData.mode != 0 || this.editModeData.frozen ){ return; }

        // raycast to mesh 
        let result = this.configurer.doRaycast( rayOr, rayDir );
        
        if ( result ){
            this.editModeData.p.setPos( result );
            const boneSrcPos = this.editModeData.pointSelected.getBoneSrcPos();
            let dir = new THREE.Vector3();
            dir.subVectors( result, boneSrcPos );
            dir.projectOnPlane( this.configurer.worldY );
            dir.normalize();
            dir = this.configurer.sphericalToEllipsoidal( dir );
            dir.normalize();
            this.editModeData.p.setDir( dir );
        }        
    }

    update(){
        let rayDir = new THREE.Vector3( this.mouse.x, this.mouse.y, -1); 
        rayDir.applyMatrix4( this.camera.projectionMatrixInverse ).applyMatrix4( this.camera.matrixWorld );
        rayDir.subVectors( rayDir, this.camera.position ).normalize(); 

        switch( this.mode ){
            case ConfigurerHelper._E_MODES.HOVER: this.updateHover( this.camera.position, rayDir ); break;
            case ConfigurerHelper._E_MODES.EDIT: this.updateEdit( this.camera.position, rayDir ); break;
        }
    }


}
export{ Configurer, ConfigurerHelper };