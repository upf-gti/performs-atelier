import * as THREE from "three";
import { findIndexOfBoneByName, getBindQuaternion, getTwistQuaternion } from "./Utils.js";

class GeometricArmIK{
    constructor( skeleton, config, isLeftHand = false ){
        this._tempM4_0 = new THREE.Matrix4();
        this._tempM3_0 = new THREE.Matrix3();
        this._tempQ_0 = new THREE.Quaternion();
        this._tempQ_1 = new THREE.Quaternion();
        this._tempQ_2 = new THREE.Quaternion();
        this._tempV3_0 = new THREE.Vector3();
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();

        this.skeleton = skeleton;
        this.config = config;
        this.isLeftHand = !!isLeftHand;

        for ( let p in this.config.boneMap ){
            this.config.boneMap[ p ] = findIndexOfBoneByName( this.skeleton, this.config.boneMap[ p ] );            
        }
        
        let handName = isLeftHand ? "L" : "R";

        this.shoulderBone = this.skeleton.bones[ this.config.boneMap[ handName + "Shoulder" ] ];
        this.armBone = this.skeleton.bones[ this.config.boneMap[ handName + "Arm" ] ];
        this.elbowBone = this.skeleton.bones[ this.config.boneMap[ handName + "Elbow" ] ];
        this.wristBone = this.skeleton.bones[ this.config.boneMap[ handName + "Wrist" ] ];

        this.bindQuats = {
            shoulder: new THREE.Quaternion(), 
            arm: new THREE.Quaternion(),
            elbow: new THREE.Quaternion(),
            wrist: new THREE.Quaternion(),
        }
        this.beforeBindAxes = {
            shoulderRaise: new THREE.Vector3(),
            shoulderHunch: new THREE.Vector3(),
            armTwist: new THREE.Vector3(), // this will also be the elevation axis
            armFront: new THREE.Vector3(),
            armBearing: new THREE.Vector3(),
            elbow: new THREE.Vector3()
        }

        // shoulder
        let boneIdx = this.config.boneMap[ handName + "Shoulder" ];
        getBindQuaternion( this.skeleton, boneIdx, this.bindQuats.shoulder );
        let m3 = this._tempM3_0.setFromMatrix4( this.skeleton.boneInverses[ boneIdx ] );
        this._tempV3_0.copy( this.config.axes[2] ).applyMatrix3( m3 ).normalize(); // convert front axis from mesh coords to local coord
        this.beforeBindAxes.shoulderHunch.crossVectors( this.skeleton.bones[ boneIdx + 1 ].position, this._tempV3_0 ).normalize(); 
        this.beforeBindAxes.shoulderRaise.crossVectors( this.skeleton.bones[ boneIdx + 1 ].position, this.beforeBindAxes.shoulderHunch ).multiplyScalar( isLeftHand ? -1: 1 ).normalize(); 

        // arm
        boneIdx = this.config.boneMap[ handName + "Arm" ];
        getBindQuaternion( this.skeleton, boneIdx, this.bindQuats.arm );
        m3.setFromMatrix4( this.skeleton.boneInverses[ boneIdx ] );
        this._tempV3_0.copy( this.config.axes[2] ).applyMatrix3( m3 ).normalize(); // convert mesh front axis to local coord
        this.beforeBindAxes.armTwist.copy( this.skeleton.bones[ boneIdx + 1 ].position ).normalize();
        this.beforeBindAxes.armBearing.crossVectors( this.beforeBindAxes.armTwist, this._tempV3_0 ).normalize(); 
        this.beforeBindAxes.armFront.crossVectors( this.beforeBindAxes.armBearing, this.beforeBindAxes.armTwist ).normalize();
        
        // elbow
        boneIdx = this.config.boneMap[ handName + "Elbow" ];
        getBindQuaternion( this.skeleton, boneIdx, this.bindQuats.elbow );
        m3.setFromMatrix4( this.skeleton.boneInverses[ boneIdx ] );
        this._tempV3_0.addVectors( this.config.axes[2], this.config.axes[1] ).applyMatrix3( m3 ).normalize(); // convert mesh front axis to local coord
        this.beforeBindAxes.elbow.crossVectors( this.skeleton.bones[ boneIdx + 1 ].position, this._tempV3_0 ).normalize();
        
        // wrist
        getBindQuaternion( this.skeleton, this.config.boneMap[ handName + "Wrist" ], this.bindQuats.wrist );

        // put in tpose
        this.shoulderBone.quaternion.copy( this.bindQuats.shoulder );
        this.armBone.quaternion.copy( this.bindQuats.arm );
        this.elbowBone.quaternion.copy( this.bindQuats.elbow );

        this.armBone.getWorldPosition( this._tempV3_0 ); // getWorldPosition updates matrices
        this.elbowBone.getWorldPosition( this._tempV3_1 );
        this.wristBone.getWorldPosition( this._tempV3_2 );        
        let v = new THREE.Vector3();
        this.armWorldSize = v.subVectors( this._tempV3_2, this._tempV3_0 ).length(); // not the same as upperarm + forearm as these bones may not be completely straight due to rigging reasons
        this.upperarmWSize = v.subVectors( this._tempV3_1, this._tempV3_0 ).length();
        this.forearmWSize = v.subVectors( this._tempV3_2, this._tempV3_1 ).length();
    }
    
    reachTarget( targetWorldPoint, forcedElbowRaiseDelta = 0, forcedShoulderRaise = 0, forcedShoulderHunch = 0, armTwistCorrection = true ){
        let wristBone = this.wristBone;
        let elbowBone = this.elbowBone;
        let armBone = this.armBone;
        let shoulderBone = this.shoulderBone;

        // set tpose quaternions, so regardless of skeleton base pose (no rotations), every avatar starts at the same pose
        shoulderBone.quaternion.copy( this.bindQuats.shoulder );
        armBone.quaternion.copy( this.bindQuats.arm );
        elbowBone.quaternion.copy( this.bindQuats.elbow );
        wristBone.updateWorldMatrix( true, false );

        let armWPos = (new THREE.Vector3()).setFromMatrixPosition( armBone.matrixWorld );     
        
        // projection of line armBone-targetPoint onto the main avatar axes (from shoulderUnion bone), normalized by the world arm length
        let targetWorldProj = new THREE.Vector3(); 
        this._tempM4_0.multiplyMatrices( this.skeleton.bones[ this.config.boneMap.ShouldersUnion ].matrixWorld, this.skeleton.boneInverses[ this.config.boneMap.ShouldersUnion ] ); // mesh to world coordinates
        let meshToWMat3 = this._tempM3_0.setFromMatrix4( this._tempM4_0 );
        this._tempV3_0.subVectors( targetWorldPoint, armWPos );
        this._tempV3_1.copy( this.config.axes[0] ).applyMatrix3( meshToWMat3 ).normalize();
        targetWorldProj.x = this._tempV3_1.dot( this._tempV3_0 ) / this.armWorldSize;
        this._tempV3_1.copy( this.config.axes[1] ).applyMatrix3( meshToWMat3 ).normalize();
        targetWorldProj.y = this._tempV3_1.dot( this._tempV3_0 ) / this.armWorldSize;
        this._tempV3_1.copy( this.config.axes[2] ).applyMatrix3( meshToWMat3 ).normalize();
        targetWorldProj.z = this._tempV3_1.dot( this._tempV3_0 ) / this.armWorldSize;
        if ( targetWorldProj.lengthSq() > 1 ){ targetWorldProj.normalize(); }// if target is beyond arm length, set projection length to 1 

        /** Shoulder Raise and Hunch */
        let shoulderHunchFactor = targetWorldProj.x * ( this.isLeftHand ? -1 : 1 );
        let shoulderRaiseFactor = targetWorldProj.y;   
        shoulderRaiseFactor = Math.max( -1, Math.min( 1, shoulderRaiseFactor * shoulderRaiseFactor * Math.sign( shoulderRaiseFactor ) ) );
        shoulderHunchFactor = Math.max( -1, Math.min( 1, shoulderHunchFactor * shoulderHunchFactor * Math.sign( shoulderHunchFactor ) ) );
        
        let shoulderRaiseAngle = forcedShoulderRaise + this.config.shoulderRaise[0]; 
        if ( shoulderRaiseFactor < 0 ){ shoulderRaiseAngle += this.config.shoulderRaise[1] * (-1) * shoulderRaiseFactor; }
        else { shoulderRaiseAngle += this.config.shoulderRaise[2] * shoulderRaiseFactor; }            
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.shoulderRaise, shoulderRaiseAngle );

        let shoulderHunchAngle = forcedShoulderHunch + this.config.shoulderHunch[0];
        if ( shoulderHunchFactor < 0 ){ shoulderHunchAngle += this.config.shoulderHunch[1] * (-1) * shoulderHunchFactor; }
        else { shoulderHunchAngle += this.config.shoulderHunch[2] * shoulderHunchFactor; }            
        this._tempQ_1.setFromAxisAngle( this.beforeBindAxes.shoulderHunch,  shoulderHunchAngle );

        let shoulderRot = this._tempQ_1.multiply( this._tempQ_0 );
        shoulderBone.quaternion.multiply( shoulderRot );
        armBone.quaternion.premultiply( shoulderRot.invert() ); // needed so the elbow raise behaves more intuitively

        // prepare variables for elbow
        wristBone.updateWorldMatrix( true, false ); // TODO should be only wrist, elbow, arm, shoulder
        armWPos.setFromMatrixPosition( armBone.matrixWorld ); // update arm position 

        // recompute projection. armWPos might have moved due to shoulder
        this._tempV3_0.subVectors( targetWorldPoint, armWPos );
        this._tempV3_1.copy( this.config.axes[0] ).applyMatrix3( meshToWMat3 ).normalize();
        targetWorldProj.x = this._tempV3_1.dot( this._tempV3_0 ) / this.armWorldSize;
        this._tempV3_1.copy( this.config.axes[1] ).applyMatrix3( meshToWMat3 ).normalize();
        targetWorldProj.y = this._tempV3_1.dot( this._tempV3_0 ) / this.armWorldSize;
        this._tempV3_1.copy( this.config.axes[2] ).applyMatrix3( meshToWMat3 ).normalize();
        targetWorldProj.z = this._tempV3_1.dot( this._tempV3_0 ) / this.armWorldSize;
        if ( targetWorldProj.lengthSq() > 1 ){ targetWorldProj.normalize(); }// if target is beyond arm length, set projection length to 1 

        let wristArmAxis = this._tempV3_2;
        let elbowRaiseQuat = this._tempQ_1;
        let armElevationBearingQuat = this._tempQ_2;

        /** Elbow */
        // Law of cosines   c^2 = a^2 + b^2 - 2ab * Cos(C)
        this._tempV3_0.subVectors( targetWorldPoint, armWPos );
        let a = this.forearmWSize; let b = this.upperarmWSize; let cc = this._tempV3_0.lengthSq(); 
        let elbowAngle = Math.acos( Math.max( -1, Math.min( 1, ( cc - a*a - b*b ) / ( -2 * a * b ) ) ) );
        cc = this.armWorldSize * this.armWorldSize;
        let misalignmentAngle = Math.acos( Math.max( -1, Math.min( 1, ( cc - a*a - b*b ) / ( -2 * a * b ) ) ) ); // angle from forearm-upperarm tpose misalignment
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.elbow, misalignmentAngle - elbowAngle ); // ( Math.PI - elbowAngle ) - ( Math.PI - misalignmentAngle )
        elbowBone.quaternion.multiply( this._tempQ_0 )
        
        elbowBone.updateMatrix();
        wristArmAxis.copy( wristBone.position ).applyMatrix4( elbowBone.matrix ).normalize(); // axis in "before bind" space

        /** Arm Computation */       
        // assuming T-pose. Move from T-Pose to arms facing forward, without any twisting.
        // the 0º bearing, 0º elevation angles correspond to the armFront axis 
        let sourceProj = { x: this.beforeBindAxes.armTwist.dot( wristArmAxis ), y: this.beforeBindAxes.armBearing.dot( wristArmAxis ), z: this.beforeBindAxes.armFront.dot( wristArmAxis ) };
        let sourceAngles = { elevation: Math.asin( sourceProj.y ), bearing: Math.atan2( -sourceProj.x, sourceProj.z ) };        
        armElevationBearingQuat.set(0,0,0,1);
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.armBearing, - sourceAngles.bearing );
        armElevationBearingQuat.premultiply( this._tempQ_0 );
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.armTwist, - sourceAngles.elevation );
        armElevationBearingQuat.premultiply( this._tempQ_0 );

        // move to target
        armBone.updateWorldMatrix( false, false ); // only update required is for the arm
        let wToLArm = this._tempM4_0.copy( this.armBone.matrixWorld ).invert(); // world to local
        let targetLocalDir = this._tempV3_0.copy( targetWorldPoint ).applyMatrix4( wToLArm ).normalize();
        let rotAxis = this._tempV3_1.crossVectors( this.beforeBindAxes.armFront, targetLocalDir ).normalize();
        this._tempQ_0.setFromAxisAngle( rotAxis, this.beforeBindAxes.armFront.angleTo( targetLocalDir ) );
        armElevationBearingQuat.premultiply( this._tempQ_0 );

        /** ElbowRaise Computation */
        let elbowRaiseAngle = -1.5* ( 1 - elbowAngle / Math.PI ); 
        elbowRaiseAngle += Math.PI * 0.1 * Math.max( 0, Math.min( 1, targetWorldProj.x * 2 * (this.isLeftHand?-1:1)) );  // x / 0.5
        elbowRaiseAngle += -Math.PI * 0.1 * Math.max( 0, Math.min( 1, targetWorldProj.y * 2 ) ); // y / 0.5
        elbowRaiseAngle += Math.PI * 0.2 * Math.max( 0, Math.min( 1, -targetWorldProj.z * 5 ) ); // z / 0.2
        elbowRaiseAngle += forcedElbowRaiseDelta + this.config.elbowRaise;
        elbowRaiseAngle *= ( this.isLeftHand ? 1 : -1 ); // due to how axis is computed, angle for right arm is inverted
        elbowRaiseQuat.setFromAxisAngle( wristArmAxis, elbowRaiseAngle );
        
        /** Arm and ElbowRaise apply */
        armBone.quaternion.multiply( armElevationBearingQuat );
        armBone.quaternion.multiply( elbowRaiseQuat ); // elbowraiseQuat is computed in before bind before arm movement space
        if ( armTwistCorrection ) this._correctArmTwist();

    }

    // remove arm twisting and insert it into elbow. Just for aesthetics
    _correctArmTwist(){
        // remove arm twisting and insert it into elbow
        // (quaternions) R = S * T ---> T = normalize( [ Wr, proj(Vr) ] ) where proj(Vr) projection into some arbitrary twist axis
        let twistq = this._tempQ_0;
        let armQuat = this._tempQ_1.copy( this.bindQuats.arm ).invert().multiply( this.armBone.quaternion ); // armbone = ( bind * armMovement ). Do not take into account bind
        let twistAxis = this._tempV3_0.copy( this.elbowBone.position ).normalize();
        getTwistQuaternion( armQuat, twistAxis, twistq );
        this.elbowBone.quaternion.premultiply( twistq );
        this.armBone.quaternion.multiply( twistq.invert() );

        // // previous fix might induce some twisting in forearm. remove forearm twisting. Keep only swing rotation
        armQuat = this._tempQ_1.copy( this.bindQuats.elbow ).invert().multiply( this.elbowBone.quaternion ); // elbowBone = ( bind * armMovement ). Do not take into account bind
        twistAxis = this._tempV3_0.copy( this.wristBone.position ).normalize();
        getTwistQuaternion( armQuat, twistAxis, twistq );
        this.elbowBone.quaternion.multiply( twistq.invert() );
    }
}

export { GeometricArmIK };