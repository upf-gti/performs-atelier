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

        // matrices to convert from world space to MESH coordinates (not bone coordinates)
        this.meshToWorldMat4 = (new THREE.Matrix4);
        this.meshToWorldMat3 = (new THREE.Matrix3);


        this.rayDir = new THREE.Vector3();
        this.rayOr = new THREE.Vector3();
        this.raycaster = new THREE.Raycaster();


        this.points = {
            body: {},
            hand: {},
        };

        this.computeConfig();
    }

    computeConfig( ){
        this.skeleton.bones[0].updateWorldMatrix( true, true ); // parents and children also

        let a = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.LShoulder ].clone().invert() );
        let b = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.RShoulder ].clone().invert() );
        this.rightAxisMeshCoords.subVectors( a, b ).normalize();

        a = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.BelowStomach ].clone().invert() );
        b = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ this.boneMap.Hips ].clone().invert() );
        this.upAxisMeshCoords.subVectors( a, b ).normalize();
        
        this.frontAxisMeshCoords.crossVectors( this.rightAxisMeshCoords, this.upAxisMeshCoords ).normalize();
        

        this.meshToWorldMat4.multiplyMatrices( this.skeleton.bones[0].matrixWorld, this.skeleton.boneInverses[0] );
        this.meshToWorldMat4Inv = this.meshToWorldMat4.clone().invert();
        this.meshToWorldMat3.setFromMatrix4( this.meshToWorldMat4 );
        this.meshToWorldMat3Inv = this.meshToWorldMat3.clone().invert();


        this.deletePoints( this.points.body ); this.points.body = {};
        this.deletePoints( this.points.hand ); this.points.hand = {};

        this.computeBodyLocations();
        this.computeFaceLocations();
        this.computeArmLocations( false ); // right
        this.computeArmLocations( true ); // left
        this.computeHandLocations( false ); // right
        this.computeHandLocations( true ); // left

    }

    deletePoints( list ){
        for( let p in list ){
            disposeObjectSafeThreejs( list[i] );
        } 
    }

    createHandPoint( name, boneName, wpos, color = null ){
        if ( this.points.hand[ name ] || !wpos ){ return null; }
        let p = new ConfigPoint( name, boneName, wpos, null, color );
        this.points.hand[ name ] = p;
        this.scene.add( p );
        return p;
    }

    createBodyPoint( name, boneName, wpos, wdir, color = null ){
        if ( this.points.body[ name ] || !wpos ){ return null; }
        let p = new ConfigPoint( name, boneName, wpos, wdir, color );
        this.points.body[ name ] = p;
        this.scene.add( p );
        return p;
    }

    deleteHandPoint( name ){
        let o = this.points.hand[ name ];
        if ( !o ){ return; }
        disposeObjectSafeThreejs( o );
        delete this.points.hand[ name ];
    }
    deleteBodyPoint( name ){
        let o = this.points.body[ name ];
        if ( !o ){ return; }
        disposeObjectSafeThreejs( o );
        delete this.points.body[ name ];
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

            earR:   { x: Math.sin( -70 * Math.PI/180 ), y: Math.sin( 35 * Math.PI/180 ), z: Math.cos( -70 * Math.PI/180 ) },
            earL:   { x: Math.sin( 70 * Math.PI/180 ), y: Math.sin( 35 * Math.PI/180 ), z: Math.cos( 70 * Math.PI/180 ) },
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
        let worldZ = this.frontAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        let worldY = this.upAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        let worldX = this.rightAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();

        let worldHeadPos = this.skeleton.bones[ this.boneMap[ "Head" ] ].getWorldPosition( new THREE.Vector3() );
        let worldDir = new THREE.Vector3(0,0,0); // direction for the ray

        // position of bone and direction to sample. World space
        for( let f in faceLocations ){
            let localDir = faceLocations[ f ];
            //like a matrix multiplication...
            worldDir.x = localDir.x * worldX.x + localDir.y * worldY.x + localDir.z * worldZ.x;
            worldDir.y = localDir.x * worldX.y + localDir.y * worldY.y + localDir.z * worldZ.y;
            worldDir.z = localDir.x * worldX.z + localDir.y * worldY.z + localDir.z * worldZ.z;
            worldDir.normalize();

            let rayResult =  this.doRaycast( worldHeadPos, worldDir, true );
            let distanceDirection = new THREE.Vector3();
            // like a matrix multiplication without the up direction
            distanceDirection.x = localDir.x * worldX.x + localDir.z * worldZ.x;
            distanceDirection.y = localDir.x * worldX.y + localDir.z * worldZ.y;
            distanceDirection.z = localDir.x * worldX.z + localDir.z * worldZ.z;
            this.createBodyPoint( f, this.skeleton.bones[ this.boneMap[ "Head" ] ].name,  rayResult, distanceDirection );              
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
        
        // compute front, up, right in scene world coordinates. Use root as the one defining the rotation difference from bind
        let worldZ = this.frontAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        let worldX = this.rightAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();

        let worldPos = new THREE.Vector3(0,0,0);
        let worldDir = new THREE.Vector3(0,0,0);
        
        // position of bone and direction to sample. World space
        for( let b in bodyLocations ){
            let boneName = this.skeleton.bones[ this.boneMap[ bodyLocations[b].tgBone ] ].name;
            
            worldPos.set(0,0,0);
            worldDir.set(0,0,0);
            // compute world point 
            let locs = bodyLocations[ b ].pos;
            for ( let i = 0; i < locs.length; ++i ){
                worldPos.add( this.skeleton.bones[ this.boneMap[ locs[i] ] ].getWorldPosition( new THREE.Vector3() ) );
            }
            worldPos.multiplyScalar( 1 / locs.length );

            let color = Math.random() * 0xffffff;
            // forward
            worldDir.copy( worldZ );
            this.createBodyPoint( b, boneName, this.doRaycast( worldPos, worldDir, true ), worldDir, color);
            
            // left at
            worldDir.copy( worldX ).multiplyScalar( 0.5 ).add( worldZ ).normalize();
            this.createBodyPoint( b + "_SideL", boneName, this.doRaycast( worldPos, worldDir, true ), worldDir, color);

            // left beside
            worldDir.copy( worldX ).multiplyScalar( 3 ).add( worldZ ).normalize();
            this.createBodyPoint( b + "_SideLL", boneName, this.doRaycast( worldPos, worldDir, true ), worldDir, color);

            // right at
            worldDir.copy( worldX ).multiplyScalar( -0.5 ).add( worldZ ).normalize();
            this.createBodyPoint( b + "_SideR", boneName, this.doRaycast( worldPos, worldDir, true ), worldDir, color);

            // right beside
            worldDir.copy( worldX ).multiplyScalar( -3 ).add( worldZ ).normalize();
            this.createBodyPoint( b + "_SideRR", boneName, this.doRaycast( worldPos, worldDir, true ), worldDir, color);
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
        let worldZ = this.frontAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        let worldY = this.upAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        let worldX = this.rightAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();

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

                this.createHandPoint( l + d, boneName, this.doRaycast( worldPos, worldDir, false ), color );
            }
        }
    }

    computeHandLocations( isLeft = false ){
        let wrist = this.boneMap[ (isLeft?"L":"R") + "Wrist" ];
        let fingerbases = [ this.boneMap[ (isLeft?"L":"R") + "HandIndex" ], this.boneMap[ (isLeft?"L":"R") + "HandMiddle" ], this.boneMap[ (isLeft?"L":"R") + "HandRing" ], this.boneMap[ (isLeft?"L":"R") + "HandPinky" ] ];
        
        // compute front, up, right in scene world coordinates. Use root as the one defining the rotation difference from bind
        let worldZ = this.frontAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();
        let worldY = this.upAxisMeshCoords.clone().applyMatrix3( this.meshToWorldMat3 ).normalize();

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
            this.createHandPoint( (i+2) + "BaseBack", boneName, this.doRaycast( worldPos, worldY, false ), color ); // compute from inside of mesh
            this.createHandPoint( (i+2) + "BasePalmar", boneName, this.doRaycast( worldPos, worldDir.copy( worldY ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            
            this.skeleton.bones[ fingerbases[i]+1 ].getWorldPosition(_tempV3_0 );
            worldPos.lerpVectors( worldPos, _tempV3_0, 0.35 );
            this.createHandPoint( (i+2) + "BaseRadial", boneName, this.doRaycast( worldPos, worldZ, false ), color ); // compute from inside of mesh
            this.createHandPoint( (i+2) + "BaseUlnar", boneName, this.doRaycast( worldPos, worldDir.copy( worldZ ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
          
            // mid finger
            color = Math.random() * 0xffffff;
            this.skeleton.bones[ fingerbases[i]+1 ].getWorldPosition( worldPos );            
            boneName = this.skeleton.bones[ fingerbases[i]+1 ].name;
            this.createHandPoint( (i+2) + "MidBack", boneName, this.doRaycast( worldPos, worldY, false ), color ); // compute from inside of mesh
            this.createHandPoint( (i+2) + "MidPalmar", boneName, this.doRaycast( worldPos, worldDir.copy( worldY ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            this.createHandPoint( (i+2) + "MidRadial", boneName, this.doRaycast( worldPos, worldZ, false ), color ); // compute from inside of mesh
            this.createHandPoint( (i+2) + "MidUlnar", boneName, this.doRaycast( worldPos, worldDir.copy( worldZ ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            
            // PAD
            color = Math.random() * 0xffffff;
            this.skeleton.bones[ fingerbases[i]+2 ].getWorldPosition( worldPos );            
            this.skeleton.bones[ fingerbases[i]+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
            worldPos.lerpVectors( worldPos, _tempV3_0, 0.5 );
            boneName = this.skeleton.bones[ fingerbases[i]+2 ].name;
            this.createHandPoint( (i+2) + "PadBack", boneName, this.doRaycast( worldPos, worldY, false ), color ); // compute from inside of mesh
            this.createHandPoint( (i+2) + "PadPalmar", boneName, this.doRaycast( worldPos, worldDir.copy( worldY ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
            this.createHandPoint( (i+2) + "PadRadial", boneName, this.doRaycast( worldPos, worldZ, false ), color ); // compute from inside of mesh
            this.createHandPoint( (i+2) + "PadUlnar", boneName, this.doRaycast( worldPos, worldDir.copy( worldZ ).multiplyScalar(-1), false ), color ); // compute from inside of mesh
           
            //Tip
            this.skeleton.bones[ fingerbases[i]+2 ].getWorldPosition( worldPos );            
            this.skeleton.bones[ fingerbases[i]+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
            worldDir.subVectors(  _tempV3_0, worldPos ).normalize();
            boneName = this.skeleton.bones[ fingerbases[i]+2 ].name;
            this.createHandPoint( (i+2) + "Tip", boneName, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
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
            this.createHandPoint( s[i] + "Ulnar", boneName, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( "ThumbballUlnar", boneName, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
            this.createHandPoint( s[i] + "Radial", boneName, this.doRaycast( worldPos, worldDir.multiplyScalar(-1), false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( "ThumbballRadial", boneName, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
        
            worldDir.crossVectors( worldDir, _tempV3_0 ).normalize();
            this.createHandPoint( s[i] + "Back", boneName, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( "ThumbballBack", boneName, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
            this.createHandPoint( s[i] + "Palmar", boneName, this.doRaycast( worldPos, worldDir.multiplyScalar(-1), false ), color ); // compute from inside of mesh
            if ( s[i] == "1Base" ) { this.createHandPoint( "ThumbballPalmar", boneName, this.doRaycast( worldPos, worldDir, false ), color ); }// compute from inside of mesh
        }
        
        // thumb Tip
        this.skeleton.bones[ thumbidx+2 ].getWorldPosition( worldPos );            
        this.skeleton.bones[ thumbidx+3 ].getWorldPosition( _tempV3_0 ); // bone on tip of finger
        worldDir.subVectors(  _tempV3_0, worldPos ).normalize();
        let boneName = this.skeleton.bones[ thumbidx+2 ].name;
        this.createHandPoint( "Tip", boneName, this.doRaycast( worldPos, worldDir, false ), color ); // compute from inside of mesh
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



    scalePoints( s ){
        for( let a in this.points ){
            for ( let b in this.points[a] ){
                this.points[a][b].scale.set( s,s,s );
            }
        }
    }
}


class ConfigPoint extends THREE.Group {
    constructor( name, boneAssigned, wpos, wdir = null, color = 0 ){
        super();
        if ( isNaN(color) || color == null ){ color = Math.random() * 0xffffff; }
        this.configInfo = {
            name: name,
            boneAssigned: boneAssigned,
            wdir: wdir? wdir.clone() : null,
            color: color,
            sphere: null,
            arrow: null,
        };

        this.name = name;
        this.position.set(0,0,0); // neded for the lookat

        let sphere = this.configInfo.sphere = new THREE.Mesh( new THREE.SphereGeometry(0.005,16,16), new THREE.MeshStandardMaterial( { depthWrite:true, depthTest:true, color: color } ) );
        sphere.position.set( 0,0,0 );
        this.add(sphere);
        
        // arrow for direction purposes. BodyLocation and FaceLocation
        if ( wdir ){
            let arrow = this.configInfo.arrow = new THREE.ArrowHelper();
            arrow.setColor( color );
            arrow.setDirection( {x:0,y:0,z:1} ); // make it point to the z
            arrow.setLength( 0.10, 0.05, 0.01 );
            // arrow.setLength( 0.10 );
            this.add( arrow );
            this.lookAt( wdir ); // rotate entire group
        }

        this.position.copy( wpos );
    }

    // different from clone() which is from threejs
    clonePoint(){
        return new ConfigPoint( this.configInfo.name, this.configInfo.boneAssigned, this.position, this.configInfo.wdir, this.configInfo.color );
    }

    getDir( result ){ 
        if ( !this.configInfo.arrow ){ return null; }
        if(!result){ result = new THREE.Vector3(); }
        result.set( 0,0,1 ).applyQuaternion( this.quaternion );
        return result;
    }

    getPos( result ){
        if( !result ){ result = new THREE.Vector3(); }
        result.copy( this.position );
        return result;
    }

}

export{ Configurer };