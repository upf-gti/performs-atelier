import * as THREE from "three"
import { disposeObjectSafeThreejs, findIndexOfBoneByName, objectConcat } from "./Utils.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

class Configurer {
    constructor( skeleton, model, scene ){
        this.model = model;
        this.skeleton = skeleton;
        this.skeleton.pose(); // set on bind pose
        this.skeleton.bones[0].updateWorldMatrix( true, true ); // parents and children also
        this.scene = scene; 
        scene.updateWorldMatrix( true, true );

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

        this.computeMatrices();
    }
    
    computeMatrices() {
        this.skeleton.bones[0].updateWorldMatrix( true, true ); // parents and children also

        this.meshToWorldMat4 = this.skeleton.bones[0].parent.matrixWorld.clone();
        this.meshToWorldMat4Inv = this.meshToWorldMat4.clone().invert();
        this.meshToWorldMat3.setFromMatrix4( this.meshToWorldMat4 );
        this.meshToWorldMat3Inv = this.meshToWorldMat3.clone().invert();
    }

    setBoneMap(boneMap, recompute = false) {
        this.boneMap = {};
        for( let b in boneMap ){
            this.boneMap[b] = findIndexOfBoneByName( this.skeleton, boneMap[b] );
        }

        if (recompute) {
            this.computeMatrices();
            this.computeAxes();
            this.computeConfig();
        }
    }
    
    setConfig(configFile) {
        let colors = {};

        for (const bodyLoc in configFile.bodyLocations) {
            let mainName = bodyLoc.replace(/_SideRR/i, "").replace(/_SideR/i, "").replace(/_SideLL/i, "").replace(/_SideL/i, "");
            if ( !colors[mainName] ) { colors[mainName] = Math.random() * 0xffffff; }
            
            let o = configFile.bodyLocations[bodyLoc];
            this.points.body.push({
                boneAssigned: o[0],
                wpos: new THREE.Vector3( o[1].x, o[1].y, o[1].z).clone().applyMatrix4( this.meshToWorldMat4 ),
                wdir: new THREE.Vector3( o[2].x, o[2].y, o[2].z).clone().applyMatrix3( this.meshToWorldMat3 ),
                name: bodyLoc,
                color: colors[mainName],
                boneSrcPos: this.skeleton.bones[ findIndexOfBoneByName(this.skeleton, o[0]) ].getWorldPosition( new THREE.Vector3() )
            });
        }
        
        for (const handLoc in configFile.handLocationsL) {
            let mainName = handLoc.replace(/_Right/i, "").replace(/_Left/i, "").replace(/_Ulnar/i, "").replace(/_Radial/i, "").replace(/_Front/i, "").replace(/_Back/i, "").replace(/_Palmar/i, "");
            if ( !colors[mainName] ) { colors[mainName] = Math.random() * 0xffffff; }
            
            let o = configFile.handLocationsL[handLoc];
            this.points.handL.push({
                boneAssigned: o[0],
                wpos: new THREE.Vector3( o[1].x, o[1].y, o[1].z).clone().applyMatrix4( this.meshToWorldMat4 ),
                name: handLoc,
                color: colors[mainName],
                boneSrcPos: this.skeleton.bones[ findIndexOfBoneByName(this.skeleton, o[0]) ].getWorldPosition( new THREE.Vector3() )
            });
        }
        
        for (const handLoc in configFile.handLocationsR) {
            let mainName = handLoc.replace(/_Right/i, "").replace(/_Left/i, "").replace(/_Ulnar/i, "").replace(/_Radial/i, "").replace(/_Front/i, "").replace(/_Back/i, "").replace(/_Palmar/i, "");
            if ( !colors[mainName] ) { colors[mainName] = Math.random() * 0xffffff; }

            let o = configFile.handLocationsR[handLoc];
            this.points.handR.push({
                boneAssigned: o[0],
                wpos: new THREE.Vector3( o[1].x, o[1].y, o[1].z).clone().applyMatrix4( this.meshToWorldMat4 ),
                name: handLoc,
                color: colors[mainName],
                boneSrcPos: this.skeleton.bones[ findIndexOfBoneByName(this.skeleton, o[0]) ].getWorldPosition( new THREE.Vector3() )
            });
        }
    }

    getAxes() {
        return [this.rightAxisMeshCoords, this.upAxisMeshCoords, this.frontAxisMeshCoords];
    }

    computeAxes(axes = null){
        if (axes) {
            this.rightAxisMeshCoords = new THREE.Vector3( axes[0].x, axes[0].y, axes[0].z );
            this.upAxisMeshCoords = new THREE.Vector3( axes[1].x, axes[1].y, axes[1].z );
            this.frontAxisMeshCoords = new THREE.Vector3( axes[2].x, axes[2].y, axes[2].z );
        }
        else {
            let a = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.LShoulder ].clone().invert() );
            let b = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.RShoulder ].clone().invert() );
            this.rightAxisMeshCoords.subVectors( a, b ).normalize();

            a = a.setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.BelowStomach ].clone().invert() );
            b = b.setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.Hips ].clone().invert() );
            this.upAxisMeshCoords.subVectors( a, b ).normalize();
            
            this.frontAxisMeshCoords.crossVectors( this.rightAxisMeshCoords, this.upAxisMeshCoords ).normalize();
            this.upAxisMeshCoords.crossVectors( this.frontAxisMeshCoords, this.rightAxisMeshCoords ).normalize();
        }

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
        // dx: delta to add in the direction X to move from sidell to siderr
        let faceLocations = { 
            HEAD_TOP:       { dx: Math.cos( 75 * Math.PI/180 ), x: 0, y: Math.sin( 60 * Math.PI/180 ), z: Math.cos( 60 * Math.PI/180 ), srcBone: "Head" },
            FOREHEAD:       { dx: Math.cos( 75 * Math.PI/180 ), x: 0, y: Math.sin( 42 * Math.PI/180 ), z: Math.cos( 42 * Math.PI/180 ), srcBone: "Head" },

            EYEBROWS_LINE:  { dx: Math.sin( 20 * Math.PI/180 ), x: 0, y: Math.sin( 25 * Math.PI/180 ), z: Math.cos( 25 * Math.PI/180 ), srcBone: "Head", srcBoneY: "LEye" },
            EYEBROW_RIGHT:  { dx: Math.cos( 70 * Math.PI/180 ), x: 0, y: Math.sin( 35 * Math.PI/180 ), z: Math.cos( 35 * Math.PI/180 ), srcBone: "REye" },
            EYEBROW_LEFT:   { dx: Math.cos( 70 * Math.PI/180 ), x: 0, y: Math.sin( 35 * Math.PI/180 ), z: Math.cos( 35 * Math.PI/180 ), srcBone: "LEye" },
            EYES_LINE:      { dx: Math.sin( 20 * Math.PI/180 ), x: 0, y: 0, z: 1, srcBone: "Head", srcBoneY: "LEye" },
            EYE_RIGHT:      { dx: Math.cos( 60 * Math.PI/180 ), x: 0, y: 0, z: 1, srcBone: "REye" },
            EYE_LEFT:       { dx: Math.cos( 60 * Math.PI/180 ), x: 0, y: 0, z: 1, srcBone: "LEye" },
            
            EAR_RIGHT:      { dx: Math.cos( 85 * Math.PI/180 ), x: Math.sin( -135 * Math.PI/180 ), y: Math.sin( -20 * Math.PI/180 ), z: Math.cos( -135 * Math.PI/180 ), srcBone: "Head", srcBoneY: "REye" },
            EAR_LEFT:       { dx: Math.cos( 85 * Math.PI/180 ), x: Math.sin( 135 * Math.PI/180 ), y: Math.sin( -20 * Math.PI/180 ), z: Math.cos( 135 * Math.PI/180 ), srcBone: "Head", srcBoneY: "LEye" },
            EARLOBE_RIGHT:  { dx: Math.cos( 85 * Math.PI/180 ), x: Math.sin( -135 * Math.PI/180 ), y: Math.sin( -35 * Math.PI/180 ), z: Math.cos( -135 * Math.PI/180 ), srcBone: "Head", srcBoneY: "REye" },
            EARLOBE_LEFT:   { dx: Math.cos( 85 * Math.PI/180 ), x: Math.sin( 135 * Math.PI/180 ), y: Math.sin( -35 * Math.PI/180 ), z: Math.cos( 135 * Math.PI/180 ), srcBone: "Head", srcBoneY: "LEye" },

            NOSE:           { dx: Math.cos( 85 * Math.PI/180 ), x: 0, y: Math.sin( 15 * Math.PI/180 ), z: Math.cos( 15 * Math.PI/180 ), srcBone: "Head" },
            BELOW_NOSE:     { dx: Math.cos( 85 * Math.PI/180 ), x: 0, y: Math.sin( 7 * Math.PI/180 ), z: Math.cos( 7 * Math.PI/180 ), srcBone: "Head" },
            CHEEK_RIGHT:    { dx: Math.cos( 80 * Math.PI/180 ), x: Math.sin( -30 * Math.PI/180 ), y: 0, z: Math.cos( -30 * Math.PI/180 ), srcBone: "Head" },
            CHEEK_LEFT:     { dx: Math.cos( 80 * Math.PI/180 ), x: Math.sin( 30 * Math.PI/180 ), y: 0, z: Math.cos( 30 * Math.PI/180 ), srcBone: "Head" },
            MOUTH:          { dx: Math.cos( 80 * Math.PI/180 ), x: 0, y: 0, z: 1, srcBone: "Head" },
            CHIN:           { dx: Math.cos( 80 * Math.PI/180 ), x: 0, y: Math.sin( -20 * Math.PI/180 ), z: Math.cos( -20 * Math.PI/180 ), srcBone: "Head" },
            UNDER_CHIN:     { dx: Math.cos( 80 * Math.PI/180 ), x: 0, y: Math.sin( -30 * Math.PI/180 ), z: Math.cos( -30 * Math.PI/180 ), srcBone: "Head" },
        }
        
        // compute front, up, right in scene world coordinates. Use root as the one defining the rotation difference from bind
        let worldZ = this.worldZ;
        let worldY = this.worldY;
        let worldX = this.worldX;

        let worldHeadPos = new THREE.Vector3();
        let worldDir = new THREE.Vector3(0,0,0); // direction for the ray
        
        let sides = [ "_SideLL", "_SideL", "", "_SideR", "_SideRR" ]; // same as body
        // position of bone and direction to sample. World space
        for( let f in faceLocations ){
            let color = Math.random() * 0xffffff;
            let localDir = faceLocations[ f ];

            //like a matrix multiplication...
            worldDir.set(0,0,0);
            worldDir.addScaledVector( worldX, localDir.x );
            worldDir.addScaledVector( worldY, localDir.y );
            worldDir.addScaledVector( worldZ, localDir.z );
            worldDir.normalize();

            let pointDir = new THREE.Vector3(0,0,0);
            pointDir.addScaledVector( worldX, localDir.x );
            // pointDir.addScaledVector( worldY, localDir.y );
            pointDir.addScaledVector( worldZ, localDir.z < 0 ? 0 : localDir.z );
            pointDir.normalize();

            
            worldHeadPos = this.skeleton.bones[ this.boneMap[ localDir.srcBone ] ].getWorldPosition( new THREE.Vector3() );
            if (localDir.srcBoneY) {
                worldHeadPos.y = this.skeleton.bones[ this.boneMap[ localDir.srcBoneY ] ].getWorldPosition( new THREE.Vector3() ).y;
                worldHeadPos.z = this.skeleton.bones[ this.boneMap[ localDir.srcBoneY ] ].getWorldPosition( new THREE.Vector3() ).z;
            }            
            let dirSidesXOffset = worldX.clone().multiplyScalar( localDir.dx );
            worldDir.add( dirSidesXOffset ).add( dirSidesXOffset ); // start at SideLL and iteratively go to SideRR
            pointDir.add( dirSidesXOffset ).add( dirSidesXOffset ); // start at SideLL and iteratively go to SideRR
            
            for ( let i = 0; i < sides.length; ++i ){
                // need to subtract worldY from direction. Only X-Z plane is desired. sphericalToEllipsoidal already does this.
                // this.createBodyPoint( f + sides[i], this.skeleton.bones[ this.boneMap[ "Head" ] ].name, worldHeadPos, this.doRaycast( worldHeadPos, worldDir, true ), this.sphericalToEllipsoidal( worldDir ), color );
                this.createBodyPoint( f + sides[i], this.skeleton.bones[ this.boneMap[ localDir.srcBone ] ].name, worldHeadPos, this.doRaycast( worldHeadPos, worldDir, true ), pointDir.normalize(), color ); //this.sphericalToEllipsoidal( worldDir ), color );
                worldDir.sub( dirSidesXOffset );
                pointDir.sub( dirSidesXOffset );
            }
        }
    }

    computeBodyLocations(){      
        let bodyLocations ={ // firs in array is the bone target. Rest of bones define the location (Average)
            HEAD:         { tgBone: "Head", pos: [ "Head" ] },
            NECK:         { tgBone: "Neck", pos: [ "Neck", "Neck", "Head" ] },
            SHOULDER_TOP:  { tgBone: "ShouldersUnion", pos: [ "LShoulder", "RShoulder", "Neck" ] },
            SHOULDER_LINE: { tgBone: "ShouldersUnion", pos: [ "LShoulder", "RShoulder", "ShouldersUnion" ] },
            SHOULDER_LEFT:    { tgBone: "ShouldersUnion", pos: [ "LArm" ] },
            SHOULDER_RIGHT:    { tgBone: "ShouldersUnion", pos: [ "RArm" ] },
            CHEST:        { tgBone: "ShouldersUnion", pos: [ "ShouldersUnion" ] },
            STOMACH:      { tgBone: "Stomach", pos: [ "Stomach" ] },
            BELOW_STOMACH: { tgBone: "BelowStomach", pos: [ "BelowStomach" ] },
            NEUTRAL:      { tgBone: "Hips", pos: [ "Hips" ] }
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
        // assuming arms in t-pose and hands more less palm looking down
        let armLocations = {
            FOREARM: {
                tgBone: "Elbow", pos: [ "Wrist", "Elbow" ],
                dir: { RADIAL: { x:0, y:0, z:1 }, ULNAR: { x:0, y:0, z:-1 }, BACK: { x:0, y:1, z:0 }, PALMAR: { x:0, y:-1, z:0 } },
                color: 0x1be609
            },
            ELBOW: {
                tgBone: "Arm",   pos: [ "Elbow" ],
                dir: { 
                    LEFT: { x:0, y: (isLeft ? 1 : -1), z: 0 }, 
                    RIGHT: { x:0, y: (isLeft ? -1 : 1), z: 0 }, 
                    BACK: { x:0, y:0, z:-1 }, 
                    FRONT: { x:0, y:0, z:1 } 
                },
                color: 0xadfa50
            },
            UPPER_ARM: {
                tgBone: "Arm",   pos: [ "Elbow", "Arm", "Elbow" ],
                dir: { 
                    LEFT: { x:0, y:(isLeft ? 1 : -1), z: 0 }, 
                    RIGHT: { x:0, y:(isLeft ? -1 : 1), z: 0 }, 
                    BACK: { x:0, y:0, z:-1 }, 
                    FRONT: { x:0, y:0, z:1 } 
                },
                color: 0xe6ab07
            }
        }
        

        let worldPos = new THREE.Vector3(0,0,0);
        let worldDir = new THREE.Vector3(0,0,0);
        
        const armUpVec = new THREE.Vector3(0,0,0); // perpendicular to bone
        const armFrontVec = new THREE.Vector3(0,0,0); // bone direction
        const armSideVec = new THREE.Vector3(0,0,0); // perpendicular to front and up

        // position of bone and direction to sample. World space
        for( let l in armLocations ){
            let location = armLocations[l];
            let color = location.color;
            for ( let d in location.dir ){
                const boneIdx = this.boneMap[ (isLeft?"L":"R") + location.tgBone ];
                let boneName = this.skeleton.bones[ boneIdx ].name;

                // compute direction vectors. Since each bone might be slightly bended, recompute it on each location
                this.skeleton.bones[ boneIdx + 1 ].getWorldPosition(armFrontVec);
                this.skeleton.bones[ boneIdx ].getWorldPosition(worldPos);
                armFrontVec.sub(worldPos).normalize();
                armUpVec.crossVectors( armFrontVec, this.worldZ ).normalize();
                armSideVec.crossVectors( armUpVec, armFrontVec ).normalize();
                if ( isLeft ){
                    armUpVec.multiplyScalar(-1);
                }

                // reset variables
                worldPos.set(0,0,0);
                worldDir.set(0,0,0);

                // compute world point for origin of ray
                const locs = location.pos;
                for ( let i = 0; i < locs.length; ++i ){
                    worldPos.add( this.skeleton.bones[ this.boneMap[ (isLeft?"L":"R") + locs[i] ] ].getWorldPosition( new THREE.Vector3() ) );
                }
                worldPos.multiplyScalar( 1 / locs.length );


                //like a matrix multiplication...
                let localDir = location.dir[d];
                worldDir.x = localDir.x * armFrontVec.x + localDir.y * armUpVec.x + localDir.z * armSideVec.x;
                worldDir.y = localDir.x * armFrontVec.y + localDir.y * armUpVec.y + localDir.z * armSideVec.y;
                worldDir.z = localDir.x * armFrontVec.z + localDir.y * armUpVec.z + localDir.z * armSideVec.z;
                worldDir.normalize();

                this.createHandPoint( isLeft, l + "_" + d, boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color );
            }
        }
    }

    computeHandLocations( isLeft = false ){
        let wrist = this.boneMap[ (isLeft?"L":"R") + "Wrist" ];
        let fingerbases = [ this.boneMap[ (isLeft?"L":"R") + "HandIndex" ], this.boneMap[ (isLeft?"L":"R") + "HandMiddle" ], this.boneMap[ (isLeft?"L":"R") + "HandRing" ], this.boneMap[ (isLeft?"L":"R") + "HandPinky" ] ];
        
        let worldPos = new THREE.Vector3(0,0,0);
        let worldDir = new THREE.Vector3(0,0,0);
        let _tempV3_0 = new THREE.Vector3(0,0,0);
        const worldWristPos = new THREE.Vector3(0,0,0);
        this.skeleton.bones[ wrist ].getWorldPosition( worldWristPos );
        
        let color; // used in for
        const colorPaletteFingers = [
            [0xcc1212, 0xb04848, 0xe69393 ],
            [0x17bd11, 0x64b048, 0xb1e693],
            [0x122bcc, 0x48a7b0, 0x93b1e6],
            [0xcc129a, 0x8f48b0, 0xe693d7]
        ]
        const colorPaletteThumb = [ 0xe06d02, 0x9e5c1c, 0xed9f55 ];

        // base direction vectors for hand. World coord
        const handUpVec = new THREE.Vector3(); // from back of hand to ouside
        const handFrontVec = new THREE.Vector3(); // from wrist to middle finger (aprox)
        const handSideVec = new THREE.Vector3(); // from base of little finger to base of index finger (thumb directino aprox)

        this.skeleton.bones[ fingerbases[0] ].getWorldPosition( worldPos ); // base of index finger world pos
        this.skeleton.bones[ fingerbases[3] ].getWorldPosition( handUpVec ); // base of little finger  world pos
        handSideVec.subVectors( worldPos, handUpVec ).normalize(); // temp side vector
        worldPos.sub( worldWristPos ); // direction of index finger
        handUpVec.sub( worldWristPos ); // direction of little finger
        handUpVec.cross( worldPos ).normalize(); 
        handFrontVec.crossVectors( handSideVec, handUpVec ).normalize();
        handSideVec.crossVectors( handUpVec, handFrontVec ).normalize();

        if ( isLeft ){
            handUpVec.multiplyScalar(-1);
        }
        // end of base direction vectors


        // WRIST 
        let boneName = this.skeleton.bones[ wrist ].name;
        worldPos.copy(worldWristPos);
        color = 0x09e670;
        this.createHandPoint( isLeft, "WRIST_BACK", boneName, worldPos, this.doRaycast( worldPos, handUpVec, false ), color ); // compute from inside of mesh
        this.createHandPoint( isLeft, "WRIST_PALMAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( handUpVec ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
        this.createHandPoint( isLeft, "WRIST_RADIAL", boneName, worldPos, this.doRaycast( worldPos, handSideVec, false ), color ); // compute from inside of mesh
        this.createHandPoint( isLeft, "WRIST_ULNAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy(handSideVec).multiplyScalar(-1), false ), color ); // compute from inside of mesh


        // HAND 
        boneName = this.skeleton.bones[ wrist ].name;
        this.skeleton.bones[ fingerbases[1] ].getWorldPosition( worldPos ); // base of middle finger  world pos
        worldPos.multiplyScalar(2.0/3.0).addScaledVector( worldWristPos, 1.0/3.0 );
        color = 0x000000;
        this.createHandPoint( isLeft, "HAND_BACK", boneName, worldPos, this.doRaycast( worldPos, handUpVec, false ), color ); // compute from inside of mesh
        this.createHandPoint( isLeft, "HAND_PALMAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( handUpVec ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
        this.createHandPoint( isLeft, "HAND_RADIAL", boneName, worldPos, this.doRaycast( worldPos, handSideVec, false ), color ); // compute from inside of mesh
        this.createHandPoint( isLeft, "HAND_ULNAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy(handSideVec).multiplyScalar(-1), false ), color ); // compute from inside of mesh


        // FINGERS
        for( let i = 0; i < fingerbases.length; ++i){
            // base of finger
            color = colorPaletteFingers[i][0];
            this.skeleton.bones[ fingerbases[i] ].getWorldPosition( worldPos );            
            boneName = this.skeleton.bones[ fingerbases[i] ].name;
            this.createHandPoint( isLeft, (i+2) + "_BASE_BACK", boneName, worldPos, this.doRaycast( worldPos, handUpVec, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "_BASE_PALMAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( handUpVec ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            
            this.skeleton.bones[ fingerbases[i]+1 ].getWorldPosition(_tempV3_0 );
            worldPos.lerpVectors( worldPos, _tempV3_0, 0.5 );
            this.createHandPoint( isLeft, (i+2) + "_BASE_RADIAL", boneName, worldPos, this.doRaycast( worldPos, handSideVec, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "_BASE_ULNAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( handSideVec ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
          
            // mid finger
            color = colorPaletteFingers[i][1];
            this.skeleton.bones[ fingerbases[i]+1 ].getWorldPosition( worldPos );            
            boneName = this.skeleton.bones[ fingerbases[i]+1 ].name;
            this.createHandPoint( isLeft, (i+2) + "_MID_BACK", boneName, worldPos, this.doRaycast( worldPos, handUpVec, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "_MID_PALMAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( handUpVec ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "_MID_RADIAL", boneName, worldPos, this.doRaycast( worldPos, handSideVec, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "_MID_ULNAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( handSideVec ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            
            // PAD
            color = colorPaletteFingers[i][2];
            this.skeleton.bones[ fingerbases[i]+2 ].getWorldPosition( worldPos );            
            this.skeleton.bones[ fingerbases[i]+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
            worldPos.lerpVectors( worldPos, _tempV3_0, 0.5 );
            boneName = this.skeleton.bones[ fingerbases[i]+2 ].name;
            this.createHandPoint( isLeft, (i+2) + "_PAD_BACK", boneName, worldPos, this.doRaycast( worldPos, handUpVec, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "_PAD_PALMAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( handUpVec ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "_PAD_RADIAL", boneName, worldPos, this.doRaycast( worldPos, handSideVec, false ), color ); // compute from inside of mesh
            this.createHandPoint( isLeft, (i+2) + "_PAD_ULNAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.copy( handSideVec ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
           
            //Tip
            color = colorPaletteFingers[i][2];
            this.skeleton.bones[ fingerbases[i]+2 ].getWorldPosition( worldPos );            
            this.skeleton.bones[ fingerbases[i]+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
            worldDir.subVectors(  _tempV3_0, worldPos ).normalize();
            boneName = this.skeleton.bones[ fingerbases[i]+2 ].name;
            this.createHandPoint( isLeft, (i+2) + "_TIP", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
        }


        // THUMB
        let thumbidx = this.boneMap[ (isLeft?"L":"R") + "HandThumb"];
        let s = [ "1_BASE", "1_MID", "1_PAD"];
        for ( let i = 0; i < 3; ++i){ 
            color = colorPaletteThumb[i];
            boneName = this.skeleton.bones[ thumbidx + i ].name;
            this.skeleton.bones[ thumbidx + i ].getWorldPosition( worldPos );            
            this.skeleton.bones[ thumbidx + i + 1 ].getWorldPosition( _tempV3_0 );            
            _tempV3_0.subVectors( _tempV3_0, worldPos ).normalize();
            worldDir.crossVectors( _tempV3_0, handSideVec ).normalize(); // needs to recompute the up vector for each segment of thumb
            this.createHandPoint( isLeft, s[i] + "_ULNAR", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
            if ( s[i] == "1_BASE" ) { this.createHandPoint( isLeft, "THUMB_BALL_ULNAR", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
            this.createHandPoint( isLeft, s[i] + "_RADIAL", boneName, worldPos, this.doRaycast( worldPos, worldDir.multiplyScalar(-1), false ), color ); // compute from inside of mesh
            if ( s[i] == "1_BASE" ) { this.createHandPoint( isLeft, "THUMB_BALL_RADIAL", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
        
            worldDir.crossVectors( worldDir, _tempV3_0 ).normalize(); // needs to recompute the side vector for each segment of thumb
            this.createHandPoint( isLeft, s[i] + "_BACK", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
            if ( s[i] == "1_BASE" ) { this.createHandPoint( isLeft, "THUMB_BALL_BACK", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
            this.createHandPoint( isLeft, s[i] + "_PALMAR", boneName, worldPos, this.doRaycast( worldPos, worldDir.multiplyScalar(-1), false ), color ); // compute from inside of mesh
            if ( s[i] == "1_BASE" ) { this.createHandPoint( isLeft, "THUMB_BALL_PALMAR", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
        }
        
        // thumb Tip
        color = colorPaletteThumb[2];
        this.skeleton.bones[ thumbidx+2 ].getWorldPosition( worldPos );            
        this.skeleton.bones[ thumbidx+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
        worldDir.subVectors(  _tempV3_0, worldPos ).normalize();
        boneName = this.skeleton.bones[ thumbidx+2 ].name;
        this.createHandPoint( isLeft, "1_TIP", boneName, worldPos, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
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
                if ( intersections[i].object && ( intersections[i].object.isMesh || intersections[i].object.isSkinnedMesh ) && intersections[i].object.visible ){ 
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
    static _CT_SPHERE_SIZE = 0.005; 
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

    toggleDepthTest(){
        this.children[0].material.depthTest = !this.children[0].material.depthTest; // sphere
        this.children[1].children[0].material.depthTest = !this.children[1].children[0].material.depthTest; // arrow: line
        this.children[1].children[1].material.depthTest = !this.children[1].children[1].material.depthTest; // arrow: tip
    }
    setDepthTest( doTest = true ){
        this.children[0].material.depthTest = !!doTest; // sphere
        this.children[1].children[0].material.depthTest = !!doTest; // arrow: line
        this.children[1].children[1].material.depthTest = !!doTest; // arrow: tip
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

    toggleDepthTest(){
        for( let a in this.points ){
            const arr = this.points[a];
            for( let i = 0; i < arr.length; ++i ){
                arr[i].toggleDepthTest();
            }
        }
    }
    setDepthTest( doTest = true ){
        for( let a in this.points ){
            const arr = this.points[a];
            for( let i = 0; i < arr.length; ++i ){
                arr[i].setDepthTest(doTest);
            }
        }
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
            this.editModeData.pointSelected.setDir( this.editModeData.p.getDir() );
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