import * as THREE from "three";
import { SkeletonHelper, reconstructSkeletonFromJSON } from "./skeletonHelper.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { findIndexOfBoneByName } from "./Utils.js";

class BoneMappingScene {
  static VIEW = 0;
  static MAP = 1;

  static BASE_COLOR = new THREE.Color().setHex(0xffffff);
  static VIEW_COLOR = new THREE.Color().setHex(0x2b3c87);
  static EDIT_COLOR = new THREE.Color().setHex(0x880aa8);
  static UNMAPED_COLOR = new THREE.Color().setHex(0xffff00);

  constructor() {
    this.scene = new THREE.Scene();

    //include lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);

    const light = new THREE.PointLight(0xffffff, 1.5, 0, 0);
    light.position.set(0, 0.5, 0.5);
    this.scene.add(light);

    this.active = false;

    this.selectedSrcBone = -1;
    this.selectedTrgBone = -1;
    this.boneMap = null;
  }

  init(root, trgSkeleton, boneMap, onSelect = null) {
    this.boneMap = boneMap;
    const clonedTrg = this.cloneSkeleton(trgSkeleton);

    const reconstructedSkeleton = reconstructSkeletonFromJSON(JSON.stringify(srcSkeletonJSON));
    const clonedSrc = this.cloneSkeleton(reconstructedSkeleton);

    clonedSrc.bones[0].position.x = -0.15;
    clonedSrc.bones[0].updateMatrixWorld(true);
    this.source = new SkeletonHelper(
      clonedSrc.bones[0],
      new THREE.Color().setHex(0x8192f0)
    );
    this.source.name = "source";
    clonedTrg.bones[0].position.x = 0.15;
    clonedTrg.bones[0].updateMatrixWorld(true);
    this.target = new SkeletonHelper(clonedTrg.bones[0]);
    this.target.name = "target";
    this.scene.add(this.source);
    this.scene.add(this.target);

    for(let srcBoneName in this.boneMap) {
        if(this.boneMap[srcBoneName] == undefined) {
            const id = findIndexOfBoneByName(this.source, srcBoneName);
            if(id < 0) {
                return;
            }
            this.source.instancedMesh.setColorAt( id, BoneMappingScene.UNMAPED_COLOR);
            this.source.instancedMesh.instanceColor.needsUpdate = true;
          }
          if(typeof(this.boneMap[srcBoneName]) == "number") {
            this.boneMap[srcBoneName] = this.target.bones[this.boneMap[srcBoneName]].name;
          }
    }

    const mappedBonesNames = Object.values(this.boneMap); // names or ids
    for (let i = 0; i < this.target.bones.length; i++) {
      const trgBoneName = this.target.bones[i].name;
      if (mappedBonesNames.indexOf(trgBoneName) < 0) {
        this.target.instancedMesh.setColorAt(i, BoneMappingScene.UNMAPED_COLOR);
        this.target.instancedMesh.instanceColor.needsUpdate = true;
      }
    }

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(root.clientWidth, root.clientHeight);

    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1;

    this.camera = new THREE.PerspectiveCamera( 40, root.clientWidth / root.clientHeight, 0.01, 100 );
    this.camera.position.set(0, 0.1, 0.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(-0.05, -0.01, 0);
    this.controls.enableDamping = true; // this requires controls.update() during application update
    this.controls.dampingFactor = 0.1;
    this.controls.enabled = true;
    this.controls.update();

    this.renderer.render(this.scene, this.camera);
    this.root = this.renderer.domElement;
    this.div = document.createElement("div");
    this.div.style.position = "absolute";
    this.div.style.bottom = "40px";
    this.div.style.L = "25%";
    this.div.innerText = "";
    root.append(this.div);
    root.appendChild(this.renderer.domElement);
    this.mouseX = 0;
    this.mouseY = 0;
    this.root.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.root.addEventListener("mouseup", this.onMouseUp.bind(this));

    this.active = true;
    this.state = BoneMappingScene.VIEW;
    this.onSelect = onSelect;
  }

  cloneSkeleton(skeleton) {
    const cloned = skeleton.clone();
    let bones = [];
    let parents = [];
    let totalLenght = 0;
    for (let i = 0; i < skeleton.bones.length; i++) {
      bones.push(skeleton.bones[i].clone(false));

      let parentIdx = -1;
      if (i != 0) {
        bones[i].parent = null;
        if (skeleton.bones[i].parent) {
          parentIdx = skeleton.bones.indexOf(skeleton.bones[i].parent);
        }
      }
      parents.push(parentIdx);
    }
    //skeleton.bones[0].parent.add(bones[0]);
    for (let i = 0; i < skeleton.bones.length; i++) {
      if (parents[i] > -1) {
        bones[parents[i]].add(bones[i]);
      }
    }
    cloned.bones = bones;
    cloned.pose();
    for (let i = 1; i < cloned.bones.length; i++) {
      const dist = cloned.bones[i]
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(
          cloned.bones[i].parent.getWorldPosition(new THREE.Vector3())
        );
      totalLenght += dist;
    }

    let scale = 1 / totalLenght;

    const globalScale = new THREE.Vector3(0.01, 0.01, 0.01);
    skeleton.bones[0].parent.getWorldScale(globalScale);
    globalScale.multiplyScalar(scale);
    cloned.bones[0].scale.copy(globalScale);
    cloned.bones[0].position.set(0, 0, 0);
    cloned.bones[0].updateMatrixWorld(true);
    return cloned;
  }

  update() {
    if (this.active) {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
  }

  onMouseDown(event) {
    this.mouseX = event.pageX;
    this.mouseY = event.pageY;
  }

  onMouseUp(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const diffX = Math.abs(event.pageX - this.mouseX);
    const diffY = Math.abs(event.pageY - this.mouseY);
    const delta = 6;

    if (diffX < delta && diffY < delta) {
      for (let i = 0; i < this.selectedSrcBone.length; i++) {
        if (this.selectedSrcBone[i] > -1) {
          let color = null;
          const srcBoneName = this.source.bones[this.selectedSrcBone[i]].name;
          if (!this.boneMap[srcBoneName]) {
            color = BoneMappingScene.UNMAPED_COLOR;
          }

          this.clearSelection(
            this.source.instancedMesh,
            this.selectedSrcBone[i],
            color
          );
        }
      }
      if (this.selectedTrgBone > -1) {
        let color = null;
        const trgBoneName = this.target.bones[this.selectedTrgBone].name;
        const mappedBonesNames = Object.values(this.boneMap);
        if (mappedBonesNames.indexOf(trgBoneName) < 0) {
          color = BoneMappingScene.UNMAPED_COLOR;
        }

        this.clearSelection(
          this.target.instancedMesh,
          this.selectedTrgBone,
          color
        );
      }
      switch (event.button) {
        case 0: // L
          this.state = BoneMappingScene.VIEW;
          this.div.innerText = "Mode: VIEW";
          break;
        case 2: // R
          this.state = BoneMappingScene.EDIT;
          this.div.innerText = "Mode: EDIT";
          break;
      }
      this.onMouseClick(event);
    }
  }

  onMouseClick(event) {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    let mouse = new THREE.Vector2();
    let { x, y, width, height } =
      this.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - x) / width) * 2 - 1;
    mouse.y = -((event.clientY - y) / height) * 2 + 1;

    let source = this.source.instancedMesh;
    let target = this.target.instancedMesh;

    // Set raycaster from the camera to the mouse direction
    // Raycaster
    let raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    // Check for intersections
    const intersects = raycaster.intersectObjects([source, target]);

    // If there is an intersection, log it or perform some action
    if (intersects.length > 0) {
      const bones = intersects[0].object.parent.bones;
      const bone = bones[intersects[0].instanceId];

      let selectColor = new THREE.Color();

      if (this.state == BoneMappingScene.VIEW) {
        selectColor = BoneMappingScene.VIEW_COLOR;
      } else if (this.state == BoneMappingScene.EDIT) {
        selectColor = BoneMappingScene.EDIT_COLOR;
      }

      // Source selected
      if (intersects[0].object == source) {
        // Select source bone
        this.selectedSrcBone = intersects[0].instanceId;
        
        if (this.state == BoneMappingScene.VIEW) {
          // Select target bone only in view mode
          this.selectedTrgBone = findIndexOfBoneByName(
            target.parent,
            this.boneMap[bone.name]
          );
          
          target.setColorAt(this.selectedTrgBone, selectColor);
          target.instanceColor.needsUpdate = true;

          // this.selectedTrgBone = -1;
        } else {
          // Only if target bone was selected previously
          // Update bone mapping in edit mode and return to view mode
          if (this.selectedTrgBone > -1) {
            const srcName = Object.keys(this.boneMap).find(
              (key) =>
              this.boneMap[key] ===
              target.parent.bones[this.selectedTrgBone].name
              );
              this.boneMap[srcName] = null;
              this.boneMap[bone.name] =
              target.parent.bones[this.selectedTrgBone].name;
              this.state = BoneMappingScene.VIEW;
              
              target.setColorAt(this.selectedTrgBone, selectColor);
              target.instanceColor.needsUpdate = true;
          }
        }

        if (this.onSelect) {
          this.onSelect(bone, this.selectedSrcBone);
        }
      } // Target selected
      else if (intersects[0].object == target) {
        // Select target bone
        this.selectedTrgBone = intersects[0].instanceId;

        if (this.state == BoneMappingScene.VIEW) {
          // Select target bone only in view mode
          const srcNames = Object.keys(this.boneMap).filter(
            (key) => this.boneMap[key] === bone.name
          );
          this.selectedSrcBone = srcNames.map((name) => findIndexOfBoneByName(source.parent, name));
  
          for (let i = 0; i < this.selectedSrcBone.length; i++) { source.setColorAt(this.selectedSrcBone[i], selectColor); }
          source.instanceColor.needsUpdate = true;

          // this.selectedSrcBone = -1;
        } else {
          if (this.selectedSrcBone > -1) {
            const srcName = Object.keys(this.boneMap).find(
              (key) => this.boneMap[key] === bone.name
            );
            // this.boneMap[srcName] = null; // clears previous mapping
            // Update bone mapping in edit mode and return to view mode
            this.boneMap[source.parent.bones[this.selectedSrcBone].name] =
            bone.name;
            this.state = BoneMappingScene.VIEW;

            source.setColorAt(this.selectedSrcBone, selectColor);
            source.instanceColor.needsUpdate = true;
          }
        }
        
        if (this.onSelect) {
          this.onSelect(
            source.parent.bones[this.selectedSrcBone[0]],
            this.selectedTrgBone
          );
        }
      }

      intersects[0].object.setColorAt(intersects[0].instanceId, selectColor);
      intersects[0].object.instanceColor.needsUpdate = true;
    }
  }

  clearSelection(mesh, boneIdx, color) {
    mesh.setColorAt(
      boneIdx,
      color || mesh.parent.color || BoneMappingScene.BASE_COLOR
    );
  }

  onUpdateFromGUI(sourceBoneName) {
    let target = this.target.instancedMesh;
    let baseTrgColor = this.target.parent.color || BoneMappingScene.BASE_COLOR;

    if (this.selectedTrgBone) {
      target.setColorAt(this.selectedTrgBone, baseTrgColor);
    }
    // Select target bone
    this.selectedTrgBone = findIndexOfBoneByName(
      target.parent,
      this.boneMap[sourceBoneName]
    );

    target.setColorAt(this.selectedTrgBone, BoneMappingScene.VIEW_COLOR);
    target.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.active = false;
    if (this.source) {
      this.scene.remove(this.source);
    }
    if (this.target) {
      this.scene.remove(this.target);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}

const srcSkeletonJSON = {
  bones: [
    {
      name: "Hips",
      position: {
        x: -0.0003290000845338798,
        y: 0.9347629924813621,
        z: 0.013172141038878446,
      },
      rotation: {
        x: -3.1415179167027203,
        y: 0.00012686642032977636,
        z: -0.004202997303701908,
      },
      scale: {
        x: 1.0000000404660974,
        y: 1.0000001053689844,
        z: 1.0000001083633743,
      },
      parentIndex: -1,
    },
    {
      name: "BelowStomach",
      position: {
        x: -0.0001250875211831889,
        y: -0.09659492982490081,
        z: -0.0015261371757026299,
      },
      rotation: {
        x: 3.141592644244471,
        y: 0.000041635822911037344,
        z: 8.466092397735926e-9,
      },
      scale: {
        x: 1.0000000043814699,
        y: 0.9999999999635074,
        z: 1.0000000044291348,
      },
      parentIndex: 0,
    },
    {
      name: "Stomach",
      position: {
        x: 0.0001332243971060216,
        y: 0.09940563073501996,
        z: -0.006209742761925199,
      },
      rotation: {
        x: -4.864165025549442e-12,
        y: 0.00012686445202891758,
        z: 7.338721099907832e-10,
      },
      scale: {
        x: 0.9999999431559934,
        y: 0.9999998807878513,
        z: 1.0000000028051275,
      },
      parentIndex: 1,
    },
    {
      name: "ShouldersUnion",
      position: {
        x: -0.00024141994582740607,
        y: 0.10082185277004485,
        z: -0.005443163299637463,
      },
      rotation: {
        x: -3.1889386956289046e-8,
        y: -2.183165745920723e-8,
        z: 6.519351826690362e-9,
      },
      scale: {
        x: 0.9999999999735016,
        y: 0.9999999999749677,
        z: 1.0000000000032654,
      },
      parentIndex: 2,
    },
    {
      name: "Neck",
      position: {
        x: -0.0028071606076337926,
        y: 0.18101644429106112,
        z: -0.01792313893498608,
      },
      rotation: {
        x: 3.1753317439584246e-11,
        y: -0.00016845682390518178,
        z: 1.615495664364389e-7,
      },
      scale: {
        x: 0.9999999921419711,
        y: 0.999999999320846,
        z: 0.9999999927682744,
      },
      parentIndex: 3,
    },
    {
      name: "Head",
      position: {
        x: -0.00018571247420230827,
        y: 0.09067714282240757,
        z: 0.004601350017783534,
      },
      rotation: {
        x: 3.7142367362048104e-8,
        y: -9.60340430213436e-10,
        z: -5.029329955070039e-8,
      },
      scale: {
        x: 1.0000000002112592,
        y: 1.0000000002086236,
        z: 0.9999999999971256,
      },
      parentIndex: 4,
    },
    {
      name: "REye",
      position: {
        x: -0.02746869696692613,
        y: 0.0654303806242369,
        z: 0.08772877872106716,
      },
      rotation: {
        x: 2.641189009169512e-7,
        y: 4.581595277018815e-10,
        z: 4.934285012994108e-8,
      },
      scale: {
        x: 0.9999999997925905,
        y: 0.9999999997728807,
        z: 0.9999999999804466,
      },
      parentIndex: 5,
    },
    {
      name: "LEye",
      position: {
        x: 0.030554830589664954,
        y: 0.06597828223865077,
        z: 0.08914245408613894,
      },
      rotation: {
        x: 6.603106289764619e-8,
        y: 4.6329311331180645e-10,
        z: -4.936387576428866e-8,
      },
      scale: {
        x: 1.0000000002075253,
        y: 1.0000000002025575,
        z: 0.9999999999951603,
      },
      parentIndex: 5,
    },
    {
      name: "HeadTop_End",
      position: {
        x: 0.0015825861312517052,
        y: 0.16422104869971688,
        z: 0.03010607923660001,
      },
      rotation: {
        x: -1.6507416796777576e-8,
        y: 9.58631193780799e-10,
        z: -3.2585866266197824e-9,
      },
      scale: {
        x: 1.0000000000138227,
        y: 1.0000000000149258,
        z: 1.0000000000013451,
      },
      parentIndex: 5,
    },
    {
      name: "LShoulder",
      position: {
        x: 0.04067397225840939,
        y: 0.12365357096634133,
        z: -0.01818014047072485,
      },
      rotation: {
        x: 3.1415911690264013,
        y: -0.07170459952337269,
        z: -1.570794887537499,
      },
      scale: {
        x: 1.000000006177118,
        y: 1.0000000301982377,
        z: 0.9999999639446115,
      },
      parentIndex: 3,
    },
    {
      name: "LArm",
      position: {
        x: -0.00717859473207394,
        y: 0.09769895126923542,
        z: 0.008807507979632735,
      },
      rotation: { x: -0.12325730141307072, y: 1.570772503552078, z: 0 },
      scale: {
        x: 0.9999999402300234,
        y: 0.9999997709309262,
        z: 0.9999999221473322,
      },
      parentIndex: 9,
    },
    {
      name: "LElbow",
      position: {
        x: -0.02551222716335448,
        y: 0.25986522165387715,
        z: -0.0009398600871635132,
      },
      rotation: {
        x: -0.000005650128585193024,
        y: 3.6892992734132686e-7,
        z: -0.05992409285930999,
      },
      scale: {
        x: 0.9999998628643519,
        y: 0.9999998900336406,
        z: 0.9999999639821063,
      },
      parentIndex: 10,
    },
    {
      name: "LWrist",
      position: {
        x: -0.02550208065373087,
        y: 0.2595322491225042,
        z: 0.00834989937051045,
      },
      rotation: {
        x: -1.5707524550341472,
        y: 1.41413695182023,
        z: 1.5707480921974244,
      },
      scale: {
        x: 0.9999999005511933,
        y: 0.999999950498583,
        z: 1.0000000295457852,
      },
      parentIndex: 11,
    },
    {
      name: "LHandThumb",
      position: {
        x: 0.013996838243414134,
        y: 0.01875791714159747,
        z: 0.026764741038876484,
      },
      rotation: { x: 0.6837211994162155, y: 1.570536863194841, z: 0 },
      scale: {
        x: 0.9999998893545234,
        y: 0.9999997714938097,
        z: 1.0000001084889685,
      },
      parentIndex: 12,
    },
    {
      name: "LHandThumb2",
      position: {
        x: 0.0006848421071112276,
        y: 0.030229148200718314,
        z: 0.01698168297754865,
      },
      rotation: {
        x: 1.5703624116460302,
        y: 1.5661969799823832,
        z: -1.5703679992044817,
      },
      scale: {
        x: 0.999999867260097,
        y: 0.999999821136754,
        z: 0.9999999667089721,
      },
      parentIndex: 13,
    },
    {
      name: "LHandThumb3",
      position: {
        x: -0.010016994416672143,
        y: 0.024389408215260033,
        z: 0.00434524491896543,
      },
      rotation: { x: -0.0024299894886733874, y: -1.570786051398848, z: 0 },
      scale: {
        x: 1.0000000793512995,
        y: 1.0000001435448054,
        z: 1.0000000116259464,
      },
      parentIndex: 14,
    },
    {
      name: "LHandThumb4",
      position: {
        x: -0.003363413525139747,
        y: 0.01812550351359521,
        z: 0.00873609941589959,
      },
      rotation: {
        x: 0.00000584320427631057,
        y: 6.151988506501405e-7,
        z: -3.551652991830466e-7,
      },
      scale: {
        x: 1.0000000317098778,
        y: 1.0000000048899926,
        z: 1.0000000179736017,
      },
      parentIndex: 15,
    },
    {
      name: "LHandIndex",
      position: {
        x: 0.004321090206963918,
        y: 0.07458304091559964,
        z: 0.026276996686431978,
      },
      rotation: {
        x: 0.06618864736155163,
        y: 0.000012312648703038088,
        z: 0.000007616673151343554,
      },
      scale: {
        x: 0.999999966039062,
        y: 1.0000000175231238,
        z: 1.0000000349493257,
      },
      parentIndex: 12,
    },
    {
      name: "LHandIndex2",
      position: {
        x: -0.0006703822168556695,
        y: 0.03202888535236026,
        z: -0.00031192538660977653,
      },
      rotation: {
        x: 0.0004765537429267357,
        y: -0.0000019322755050740185,
        z: -0.000002792633001419392,
      },
      scale: {
        x: 1.0000000120545676,
        y: 0.9999999219216728,
        z: 0.9999999696843294,
      },
      parentIndex: 17,
    },
    {
      name: "LHandIndex3",
      position: {
        x: 0.0010126900545102124,
        y: 0.021663654377858332,
        z: 0.0012447874444789786,
      },
      rotation: { x: -0.00041320394992396225, y: -1.5707888453434444, z: 0 },
      scale: {
        x: 1.000000071631911,
        y: 1.0000000389844896,
        z: 1.0000000280395807,
      },
      parentIndex: 18,
    },
    {
      name: "LHandIndex4",
      position: {
        x: -0.0014570734184689224,
        y: 0.02224805953436848,
        z: 0.0002483355754121508,
      },
      rotation: {
        x: 0.00000534277600255358,
        y: -6.92096516222144e-8,
        z: -3.6970226881815506e-7,
      },
      scale: {
        x: 0.9999999922172618,
        y: 1.0000000294281752,
        z: 0.9999999776018876,
      },
      parentIndex: 19,
    },
    {
      name: "LHandMiddle",
      position: {
        x: 0.00012895970989923455,
        y: 0.07745137745758102,
        z: 0.00662719007028293,
      },
      rotation: {
        x: -3.0807271976908743,
        y: -0.000004054226257659033,
        z: 3.1415897451395414,
      },
      scale: {
        x: 1.0000000468535604,
        y: 1.000000066666731,
        z: 1.000000007752347,
      },
      parentIndex: 12,
    },
    {
      name: "LHandMiddle2",
      position: {
        x: -0.0009575721579482277,
        y: 0.028810210545250903,
        z: 0.0004436415067525096,
      },
      rotation: {
        x: -0.00011515542128289384,
        y: -5.742439047263217e-7,
        z: 6.97642413899707e-7,
      },
      scale: {
        x: 1.0000000030078595,
        y: 1.0000000429488147,
        z: 1.0000000400318587,
      },
      parentIndex: 21,
    },
    {
      name: "LHandMiddle3",
      position: {
        x: -0.001381727779854236,
        y: 0.0277075030293098,
        z: 0.0015154459555999436,
      },
      rotation: {
        x: 0.0011177090875788987,
        y: 0.000004574881356733714,
        z: -2.0313746639663419e-7,
      },
      scale: {
        x: 0.9999999985307478,
        y: 0.9999999974731849,
        z: 0.9999999985108957,
      },
      parentIndex: 22,
    },
    {
      name: "LHandMiddle4",
      position: {
        x: 0.002648493579942901,
        y: 0.021578400497406003,
        z: -0.0014303636280500187,
      },
      rotation: {
        x: 1.5676454549623453e-11,
        y: -5.1214016996396146e-8,
        z: -0.000005460962213907228,
      },
      scale: {
        x: 0.9999999770732766,
        y: 0.9999999770543899,
        z: 1.000000000007014,
      },
      parentIndex: 23,
    },
    {
      name: "LHandRing",
      position: {
        x: -0.00016256142981552202,
        y: 0.07314107812949966,
        z: -0.009247387072056364,
      },
      rotation: {
        x: 0.03368418614045017,
        y: 0.000011386656497578899,
        z: 0.0000014409051541533901,
      },
      scale: {
        x: 1.0000000532749131,
        y: 1.0000001389628403,
        z: 1.0000000225910566,
      },
      parentIndex: 12,
    },
    {
      name: "LHandRing2",
      position: {
        x: -0.0011985979345099373,
        y: 0.023449707711398315,
        z: -0.0012691384157871716,
      },
      rotation: {
        x: 0.00037921081602456405,
        y: -0.000001364984886530579,
        z: 0.000004918524604620141,
      },
      scale: {
        x: 0.9999999793839235,
        y: 0.9999999322926837,
        z: 1.0000000125399982,
      },
      parentIndex: 25,
    },
    {
      name: "LHandRing3",
      position: {
        x: 0.00030782148758157213,
        y: 0.025294020848298904,
        z: 0.000582501801278848,
      },
      rotation: { x: 0.00013607599224394937, y: 1.5707849086835055, z: 0 },
      scale: {
        x: 0.9999999598825131,
        y: 1.000000006009447,
        z: 1.000000046410665,
      },
      parentIndex: 26,
    },
    {
      name: "LHandRing4",
      position: {
        x: -0.00026158261595199406,
        y: 0.02137342281936705,
        z: 0.000731075340425491,
      },
      rotation: {
        x: -0.000005562301000163298,
        y: -8.888877134289214e-8,
        z: 2.007518971501101e-7,
      },
      scale: {
        x: 1.0000000022201965,
        y: 0.9999999192751988,
        z: 0.9999999766734008,
      },
      parentIndex: 27,
    },
    {
      name: "LHandPinky",
      position: {
        x: 0.00484505396084578,
        y: 0.06855004169780665,
        z: -0.025167692431930185,
      },
      rotation: {
        x: 0.0044559581736953,
        y: 0.000011949921591716527,
        z: 0.000002666326681644143,
      },
      scale: {
        x: 1.0000000495822559,
        y: 1.0000000672714802,
        z: 1.0000000180713942,
      },
      parentIndex: 12,
    },
    {
      name: "LHandPinky2",
      position: {
        x: -0.0008012372049499561,
        y: 0.024596265206269563,
        z: -0.0008000344808325247,
      },
      rotation: {
        x: -3.141554563306317,
        y: 3.8943813935674015e-7,
        z: -3.141592080940859,
      },
      scale: {
        x: 1.0000000023685878,
        y: 1.0000000043427553,
        z: 1.0000000020683266,
      },
      parentIndex: 29,
    },
    {
      name: "LHandPinky3",
      position: {
        x: 0.00042611294019412327,
        y: 0.016778883429363067,
        z: -0.00026510418474964825,
      },
      rotation: { x: 0.0003610811655640247, y: -1.5707903351011654, z: 0 },
      scale: {
        x: 1.0000000145313723,
        y: 1.0000000865023373,
        z: 1.0000000718244726,
      },
      parentIndex: 30,
    },
    {
      name: "LHandPinky4",
      position: {
        x: -0.0002296248424140876,
        y: 0.016264140343761335,
        z: -0.0015955010444479445,
      },
      rotation: {
        x: -4.393898524358723e-12,
        y: 1.0224114554189717e-7,
        z: -3.50776041229053e-9,
      },
      scale: {
        x: 0.9999999998570348,
        y: 0.9999999998469674,
        z: 1.000000000010015,
      },
      parentIndex: 31,
    },
    {
      name: "RShoulder",
      position: {
        x: -0.044190283756930696,
        y: 0.12360088428991012,
        z: -0.01870152599886807,
      },
      rotation: {
        x: 3.1415919335055036,
        y: 0.07348766895924752,
        z: 1.5708025703385535,
      },
      scale: {
        x: 1.0000000258647284,
        y: 1.0000003196164213,
        z: 1.0000000661105637,
      },
      parentIndex: 3,
    },
    {
      name: "RArm",
      position: {
        x: 0.007060259209741959,
        y: 0.09418573168055258,
        z: 0.008404361408319832,
      },
      rotation: { x: -0.10418289052083705, y: -1.5707746857886802, z: 0 },
      scale: {
        x: 0.999999908400991,
        y: 0.9999997457685252,
        z: 0.9999999434143696,
      },
      parentIndex: 33,
    },
    {
      name: "RElbow",
      position: {
        x: 0.024983866461193688,
        y: 0.25943748111948317,
        z: 0.0004134113598244227,
      },
      rotation: {
        x: -0.000010094012549925566,
        y: 1.4021414384185409e-8,
        z: 0.05900586266170343,
      },
      scale: {
        x: 1.000000022525234,
        y: 0.99999993679129,
        z: 1.000000017194051,
      },
      parentIndex: 34,
    },
    {
      name: "RWrist",
      position: {
        x: 0.0257548088556685,
        y: 0.2680939445151238,
        z: 0.00795249216010907,
      },
      rotation: {
        x: -1.5707637088515265,
        y: -1.439698059051606,
        z: -1.5707678729769317,
      },
      scale: {
        x: 0.9999999577073019,
        y: 1.0000000790619425,
        z: 0.9999999414551808,
      },
      parentIndex: 35,
    },
    {
      name: "RHandPinky",
      position: {
        x: -0.0044223030761896265,
        y: 0.07003213300551847,
        z: -0.024401461112776746,
      },
      rotation: {
        x: -0.020075140195763945,
        y: -0.00000726799281140888,
        z: 0.0000058767877875022,
      },
      scale: {
        x: 1.0000000325534477,
        y: 1.0000001295146759,
        z: 1.0000000808507918,
      },
      parentIndex: 36,
    },
    {
      name: "RHandPinky2",
      position: {
        x: 0.000829134489008343,
        y: 0.028507966377669947,
        z: -0.0005450693552258717,
      },
      rotation: {
        x: -0.00022349880184884945,
        y: 6.8162375012233e-7,
        z: -0.000003322791055889432,
      },
      scale: {
        x: 1.0000000141659224,
        y: 0.9999999770751234,
        z: 1.0000000227927432,
      },
      parentIndex: 37,
    },
    {
      name: "RHandPinky3",
      position: {
        x: -0.0004776596282858314,
        y: 0.014087884064615697,
        z: 0.0004606151074117229,
      },
      rotation: {
        x: -3.141386396329515,
        y: 8.662657797465796e-7,
        z: -3.1415925207965807,
      },
      scale: {
        x: 1.0000000002653695,
        y: 1.0000001114789812,
        z: 0.9999999914623584,
      },
      parentIndex: 38,
    },
    {
      name: "RHandPinky4",
      position: {
        x: -0.00038719154118105337,
        y: 0.016172409655293096,
        z: -0.0002930233351902192,
      },
      rotation: {
        x: -7.452349275935417e-9,
        y: 7.529406752392951e-9,
        z: 2.1230005838326447e-12,
      },
      scale: {
        x: 1.000000000002542,
        y: 1.0000000004575376,
        z: 1.0000000004600704,
      },
      parentIndex: 39,
    },
    {
      name: "RHandRing",
      position: {
        x: 0.00003834907674571397,
        y: 0.07406029044978524,
        z: -0.008510980636343944,
      },
      rotation: {
        x: 0.029897248652411737,
        y: -0.0000034190131913763997,
        z: -0.0000027557632848489965,
      },
      scale: {
        x: 1.0000000111605922,
        y: 1.0000000352965468,
        z: 1.0000000367825153,
      },
      parentIndex: 36,
    },
    {
      name: "RHandRing2",
      position: {
        x: 0.002280228288115138,
        y: 0.022265745349121957,
        z: -0.0009719128258275159,
      },
      rotation: { x: -0.0002172506850759656, y: 1.5707950455549642, z: 0 },
      scale: {
        x: 0.9999999904291497,
        y: 0.9999999857614299,
        z: 0.9999999951567927,
      },
      parentIndex: 41,
    },
    {
      name: "RHandRing3",
      position: {
        x: -0.0013238917875382644,
        y: 0.024945129960499912,
        z: 0.00011826856872554359,
      },
      rotation: {
        x: 3.14158191276311,
        y: 8.548347855061009e-8,
        z: -3.141231366248264,
      },
      scale: {
        x: 0.999999948427206,
        y: 0.9999999033775399,
        z: 0.9999998952228891,
      },
      parentIndex: 42,
    },
    {
      name: "RHandRing4",
      position: {
        x: -0.000192771362419554,
        y: 0.02035823067540543,
        z: 0.002841184709948985,
      },
      rotation: {
        x: -0.000005798910008558433,
        y: 9.889724061072983e-8,
        z: -3.3836579577050693e-8,
      },
      scale: {
        x: 1.0000000004159213,
        y: 1.000000024812032,
        z: 1.0000000244092109,
      },
      parentIndex: 43,
    },
    {
      name: "RHandMiddle",
      position: {
        x: 0.0005080294938333285,
        y: 0.07823398985020202,
        z: 0.007164466836442205,
      },
      rotation: { x: 0.02244097558376571, y: -1.5707873735527538, z: 0 },
      scale: {
        x: 1.0000001135602445,
        y: 0.9999999442884604,
        z: 0.9999999000848415,
      },
      parentIndex: 36,
    },
    {
      name: "RHandMiddle2",
      position: {
        x: 0.00006459306678822246,
        y: 0.030586162716417675,
        z: -0.0010053516910737414,
      },
      rotation: { x: -8.951840940438348e-7, y: -1.570604606589441, z: 0 },
      scale: {
        x: 1.0000001233806335,
        y: 1.0000001147958781,
        z: 1.0000001111659944,
      },
      parentIndex: 45,
    },
    {
      name: "RHandMiddle3",
      position: {
        x: 0.0010661034974486228,
        y: 0.024895086049740667,
        z: 0.0013361958486064335,
      },
      rotation: { x: -0.00009742720206692308, y: -1.570790569660351, z: 0 },
      scale: {
        x: 0.9999998894031907,
        y: 0.9999997508721629,
        z: 0.9999999203523943,
      },
      parentIndex: 46,
    },
    {
      name: "RHandMiddle4",
      position: {
        x: -0.0014679278930516126,
        y: 0.022322313086933776,
        z: -0.00012204582081953852,
      },
      rotation: {
        x: 0.000005327525333371082,
        y: 1.6900603998392936e-7,
        z: -1.702593212966468e-7,
      },
      scale: {
        x: 0.9999999967689083,
        y: 0.9999998999090163,
        z: 0.9999999627783492,
      },
      parentIndex: 47,
    },
    {
      name: "RHandIndex",
      position: {
        x: -0.004577393312504174,
        y: 0.07612071325831304,
        z: 0.026658564059268267,
      },
      rotation: { x: 0.008282204439995798, y: 1.5707939531096078, z: 0 },
      scale: {
        x: 0.9999999916736789,
        y: 0.9999998767603362,
        z: 1.0000000078819382,
      },
      parentIndex: 36,
    },
    {
      name: "RHandIndex2",
      position: {
        x: -0.0004398760477055553,
        y: 0.03298519713789039,
        z: 0.00015421046470631694,
      },
      rotation: { x: 0.000003407716248345812, y: -1.570655093993036, z: 0 },
      scale: {
        x: 0.9999999547507379,
        y: 0.999999983353883,
        z: 1.0000000285893516,
      },
      parentIndex: 49,
    },
    {
      name: "RHandIndex3",
      position: {
        x: -0.0009478699140623714,
        y: 0.021491909109624063,
        z: 0.0013547775208463569,
      },
      rotation: {
        x: 3.141554923515519,
        y: -3.8943806876526166e-7,
        z: -3.141591956171821,
      },
      scale: {
        x: 1.0000000030070195,
        y: 0.999999702790398,
        z: 0.9999999980286453,
      },
      parentIndex: 50,
    },
    {
      name: "RHandIndex4",
      position: {
        x: 0.0011010167953271477,
        y: 0.019701541413430723,
        z: 0.0015821246224622396,
      },
      rotation: {
        x: -1.2280237315028554e-8,
        y: -3.584364513135292e-7,
        z: -3.2775392316885434e-10,
      },
      scale: {
        x: 0.9999999999226687,
        y: 1.000000000369607,
        z: 1.0000000004189384,
      },
      parentIndex: 51,
    },
    {
      name: "RHandThumb",
      position: {
        x: -0.01403768970250252,
        y: 0.01818601920834706,
        z: 0.026748615267949704,
      },
      rotation: { x: 0.6032687428490533, y: -1.570666708342874, z: 0 },
      scale: {
        x: 1.0000000899994501,
        y: 0.9999999497462314,
        z: 1.000000035127818,
      },
      parentIndex: 36,
    },
    {
      name: "RHandThumb2",
      position: {
        x: 0.0019325298921622491,
        y: 0.030287854802779735,
        z: 0.016576975973366714,
      },
      rotation: {
        x: -0.000009870708207161667,
        y: 1.414714574246173e-7,
        z: 0.0030274682567611134,
      },
      scale: {
        x: 0.9999999200832534,
        y: 1.000000033279687,
        z: 1.00000003519992,
      },
      parentIndex: 53,
    },
    {
      name: "RHandThumb3",
      position: {
        x: -0.00241560581910788,
        y: 0.022821039458545744,
        z: 0.008125644843246516,
      },
      rotation: {
        x: 0.000006024236749275943,
        y: -1.1090389040085022e-8,
        z: -0.0007186026986467567,
      },
      scale: {
        x: 1.0000000955244037,
        y: 1.0000001111668144,
        z: 1.0000000379310658,
      },
      parentIndex: 54,
    },
    {
      name: "RHandThumb4",
      position: {
        x: -0.0004254258511838249,
        y: 0.021937370300293302,
        z: 0.008833473798312896,
      },
      rotation: {
        x: 1.601788989238661e-10,
        y: 4.775444807944816e-7,
        z: -8.604033146500105e-10,
      },
      scale: {
        x: 0.9999999989646425,
        y: 1.0000000000000004,
        z: 0.9999999989635334,
      },
      parentIndex: 55,
    },
    {
      name: "LUpLeg",
      position: {
        x: 0.08238437784668785,
        y: 0.061444875564457546,
        z: 0.01530485535692274,
      },
      rotation: {
        x: -2.9898930119050626e-8,
        y: -0.0763129897445678,
        z: 1.4637917637286443e-7,
      },
      scale: {
        x: 0.9999998755901047,
        y: 0.9999998814054363,
        z: 0.9999999923708925,
      },
      parentIndex: 0,
    },
    {
      name: "LLeg",
      position: {
        x: 0.009991771108415315,
        y: 0.4079393776074294,
        z: -0.00038122284200567836,
      },
      rotation: {
        x: 3.141592647858328,
        y: 0.4481288390935236,
        z: -3.14159264264033,
      },
      scale: {
        x: 1.0000000992427365,
        y: 1.0000001191671413,
        z: 1.0000000748252436,
      },
      parentIndex: 57,
    },
    {
      name: "LFoot",
      position: {
        x: -0.011485142950662372,
        y: 0.3813421456347136,
        z: -0.042650647069811816,
      },
      rotation: {
        x: 1.5707987520215936,
        y: 0.000003891516268349323,
        z: -0.6640303076641286,
      },
      scale: {
        x: 0.999999912355997,
        y: 0.9999999381364708,
        z: 0.9999998613249381,
      },
      parentIndex: 58,
    },
    {
      name: "LToeBase",
      position: {
        x: -0.004652211043178436,
        y: 0.10249652445727625,
        z: -0.0696171653311543,
      },
      rotation: {
        x: 3.390324668879333e-7,
        y: -0.000004471568924048171,
        z: 0.0051836784898909695,
      },
      scale: {
        x: 1.0000000107632836,
        y: 0.9999999999587091,
        z: 0.999999959192554,
      },
      parentIndex: 59,
    },
    {
      name: "LToe_End",
      position: {
        x: -0.009593435028610653,
        y: 0.09361085814243852,
        z: -0.006865531841860929,
      },
      rotation: {
        x: 1.5794247925251893e-7,
        y: 1.1358158261579961e-8,
        z: -8.488166299487863e-8,
      },
      scale: {
        x: 1.000000049025899,
        y: 0.999999988108707,
        z: 1.0000000596589123,
      },
      parentIndex: 60,
    },
    {
      name: "RUpLeg",
      position: {
        x: -0.08224175778780968,
        y: 0.06337445075703396,
        z: 0.012454867168353949,
      },
      rotation: {
        x: 3.1415921141872083,
        y: -1.3085985480649316,
        z: 3.1415922357714665,
      },
      scale: {
        x: 1.0000000088590852,
        y: 1.0000000004641072,
        z: 0.9999999904445143,
      },
      parentIndex: 0,
    },
    {
      name: "RLeg",
      position: {
        x: -0.008537223392850271,
        y: 0.412058083873389,
        z: 0.01113452135853625,
      },
      rotation: {
        x: 3.1529143527663787e-7,
        y: -1.1994534766101281,
        z: 2.795883585147704e-7,
      },
      scale: {
        x: 1.0000001118725605,
        y: 1.0000000597279348,
        z: 1.000000123659002,
      },
      parentIndex: 62,
    },
    {
      name: "RFoot",
      position: {
        x: 0.003053355521088791,
        y: 0.3707408801038343,
        z: -0.05547484668276677,
      },
      rotation: {
        x: 1.5707950919855123,
        y: 0.0000026015869005637162,
        z: 0.24523143774420997,
      },
      scale: {
        x: 0.9999999411068776,
        y: 0.9999998234705292,
        z: 0.9999998694041168,
      },
      parentIndex: 63,
    },
    {
      name: "RToeBase",
      position: {
        x: 0.002760133553765781,
        y: 0.10162338263623907,
        z: -0.07386035386888877,
      },
      rotation: {
        x: -8.132177717740572e-8,
        y: -0.0000027961324993469405,
        z: 0.026673500101266578,
      },
      scale: {
        x: 0.9999999753985246,
        y: 1.0000000522453902,
        z: 1.0000000117138028,
      },
      parentIndex: 64,
    },
    {
      name: "RToe_End",
      position: {
        x: 0.015276241897772075,
        y: 0.09418593671945766,
        z: -0.006410828731515784,
      },
      rotation: {
        x: 4.5292243229411286e-7,
        y: 3.3754613612063386e-8,
        z: -3.4692514758370747e-7,
      },
      scale: {
        x: 0.9999999965341243,
        y: 0.9999999964004835,
        z: 0.9999999995847015,
      },
      parentIndex: 65,
    },
  ],
};

export default BoneMappingScene;
