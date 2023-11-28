import * as THREE from "three"
import { ConfigurerHelper } from "./Configurer.js";
import { LX } from 'lexgui';
import { AUConfigurer } from "./AUConfigurer.js";
import { GeometricArmIK } from "./GeometricArmIK.js";

class AppGUI{
    constructor( app ){
        this.app = app;

        // take canvas from dom, detach from dom, attach to lexgui 
        this.app.renderer.domElement.remove(); // removes from dom
        this.main_area = LX.init();
        this.main_area.attach( this.app.renderer.domElement );
        
        this.gui = null;
        
        this.bones = [];
        this.configFile = {};
        this.config = { shoulderRaise: [0,0,0], shoulderHunch: [0,0,0], elbowRaise: 0 };
        this.partsMap = {};
        
        this.initDialog = new LX.Dialog("Select an avatar", panel => {
            this.avatarSelect(panel); 
        }, { size: ["40%"], closable: false });
    }

    refresh(){
        this.gui.refresh();
    }

    avatarSelect( panel ) {
        this.avatars = {"Eva": {}, "Kevin": {}, "From disk": {}};
        this.avatars["Eva"]["filePath"] = './EvaLowTexturesV2Decimated.glb';  this.avatars["Eva"]["modelRotation"] = (new THREE.Quaternion()).setFromAxisAngle( new THREE.Vector3(1,0,0), -Math.PI/2 );
        this.avatars["Kevin"]["filePath"] = '../signon/data/kevin_finished_first_test_7.glb';  this.avatars["Kevin"]["modelRotation"] = (new THREE.Quaternion()).setFromAxisAngle( new THREE.Vector3(1,0,0), 0 );
        this.avatars["From disk"]["modelRotation"] = this.avatars["Kevin"]["modelRotation"];
    
        panel.refresh = () => {
            panel.clear();
            
            panel.addComboButtons("Choose Character", [
                {
                value: "Eva",
                    callback: (value) => { this.character = value; panel.refresh(); }
                }, {
                value: "Kevin",
                    callback: (value) => { this.character = value; panel.refresh(); }
                }, {
                value: "From disk",
                    callback: (value) => { this.character = value; this.avatars["From disk"]["filePath"] = null; panel.refresh(); }
                }
            ], {selected: this.character});

            if (this.character === "From disk") {
                panel.addFile("Upload your own avatar", (v, e) => {
                    this.avatarFile = document.getElementsByTagName("input")[1].files[0].name;
                    let extension = this.avatarFile.split(".")[1];
                    if (extension == "glb" || extension == "gltf") { this.avatars["From disk"]["filePath"] = v; }
                    else { LX.popup("Only accepts GLB and GLTF formats!"); }
                }, {type: "url"});
                panel.addCheckbox("Apply Rotation", false, (v) => {
                    this.avatars["From disk"]["modelRotation"] = ( v ? this.avatars["Eva"]["modelRotation"] : this.avatars["Kevin"]["modelRotation"] );
                });
                panel.addFile("Upload Config File (optional)", (v) => {
                    let extension = document.getElementsByTagName("input")[2].files[0].name.split(".")[1];
                    if (extension == "json") { this.configFile = JSON.parse(v); }
                    else { LX.popup("Config file must be a JSON!"); }
                }, {type: "text"});
            }

            panel.addButton(null, "Next", () => {
                if (this.avatars[this.character] && this.avatars[this.character]["filePath"]) {
                    panel.clear();
                    this.initDialog.root.remove();
                    this.createPanel();
                }
                else {
                    LX.popup("Select an avatar!");
                }
            });
        }
        panel.refresh();
    }

    createPanel() {
        
        this.app.loadVisibleModel(this.avatars[this.character]["filePath"], this.avatars[this.character]["modelRotation"]);
        this.app.loadConfigModel(this.avatars[this.character]["filePath"], this.avatars[this.character]["modelRotation"], () => {
            if (this.avatarFile) this.app.modelFileName = this.avatarFile;

            this.app.facial_configurer = new AUConfigurer(this.app.modelVisible, this.app.scene, this.configFile.faceController);
            this.partsMap = this.app.facial_configurer.partsMap;
            
            this.app.skeleton.bones.forEach((obj) => { this.bones.push(obj.name); }); // get bone names of avatar
            
            var [left_area, right_area] = this.main_area.split({sizes: ["25%", "75%"]});
            var [left_area, export_area] = left_area.split({type: "vertical", sizes: ["96%", "4%"]});
            
            const leftTabs = left_area.addTabs();

            this.panelA = new LX.Panel();
            leftTabs.add( "Body Locations", this.panelA, {onSelect: () => this.onClick("Body Locations")} );
            
            this.panelB = new LX.Panel();
            this.actionUnits( this.panelB );
            leftTabs.add( "Action Units", this.panelB, {onSelect: () => this.onClick("Action Units") });

            this.panelC = new LX.Panel();
            
            this.miscellaneous( this.panelC );
            leftTabs.add( "Miscellaneous", this.panelC, {onSelect: () => this.onClick("Miscellaneous")} );
            
            // add canvas to left upper part
            var canvas = document.getElementById("canvas");
            right_area.attach(canvas);
            canvas.width = right_area.root.clientWidth;
            canvas.height = right_area.root.clientHeight;
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            right_area.size[0] = canvas.width; right_area.size[1] = canvas.height;
            this.app.onResize();
            
            let that = this;
            right_area.onresize = function( bounding ) {
                canvas.width = bounding.width;
                canvas.height = bounding.height;
                that.app.onResize();
            };
            
            var panelD = new LX.Panel();
            this.addExport(panelD);
            export_area.attach(panelD);
            
            this.dialogClosable = new LX.Dialog("Bone Mapping", p => { this.boneMapping(p); }, { size: ["80%", "70%"], closable: false });
        });
    }
    
    boneMapping( panel ) {
        let htmlStr = "Select the corresponding bone name of your avatar to match the provided list of bone names. An automatic selection is done, adjust if needed.";
        panel.addTextArea(null, htmlStr, null, {disabled: true, fitHeight: true});
        
        if ( this.configFile.boneMap ) { this.app.boneMap = this.configFile.boneMap; }
        else { this.app.autoMapBones(); }

        let i = 0;
        for (const part in this.app.boneMap) {
            if ((i % 2) == 0) panel.sameLine(2);
            i++;
            panel.addDropdown(part, this.bones, this.app.boneMap[part], (value, event) => {
                this.app.boneMap[part] = value;
            }, {filter: true});
        }

        panel.addBlank(10);
        
        panel.addButton(null, "Next", () => { 
            // make sure all bones are mapped
            for (const bone in this.app.boneMap) {
                if ( !this.app.boneMap[bone] ) {
                    LX.popup("All bones must be mapped!");
                    return;
                }
            }

            panel.clear();
            this.dialogClosable.root.remove();

            this.app.configurer.setBoneMap(this.app.boneMap);
            
            if (this.configFile.bodyController){
                this.app.configurer.setAxes(this.configFile.bodyController.axes);
                this.app.configurer.setConfig(this.configFile.bodyController);
                this.config.elbowRaise = this.configFile.bodyController.elbowRaise * Math.PI / 180;    
                this.config.shoulderRaise = this.configFile.bodyController.shoulderRaise.map((x) => x * Math.PI / 180);    
                this.config.shoulderHunch = this.configFile.bodyController.shoulderHunch.map((x) => x * Math.PI / 180);    
            }
            else {
                this.app.configurer.computeAxes();
                this.app.configurer.computeConfig();
            }

            this.app.configurerHelper = new ConfigurerHelper( this.app.configurer, this.app.camera, this.app.renderer.domElement );
            this.app.configurerHelper.transformControls.addEventListener( "dragging-changed", (e)=>{ this.app.controls.enabled = !e.value; } );

            this.app.renderer.domElement.addEventListener( "pointermove", (e)=>{
                this.app.configurerHelper.mouse.x = ( e.offsetX / this.app.renderer.domElement.parent.size[0] ) * 2 - 1;
                this.app.configurerHelper.mouse.y = - ( e.offsetY / this.app.renderer.domElement.parent.size[1] ) * 2 + 1;
                this.panelA.widgets["Point"].onSetValue( this.app.configurerHelper.getPointHovered() ? this.app.configurerHelper.getPointHovered().name : ( this.app.configurerHelper.getPointSelected() ? this.app.configurerHelper.getPointSelected().name : null) );
            });

            this.bodyLocations(this.panelA);

            this.config.boneMap = JSON.parse( JSON.stringify( this.app.boneMap ) );
            this.config.axes = this.app.configurer.getAxes();
            this.app.ik_configurer = new GeometricArmIK(this.app.skeletonVisible, this.config, false);
            this.config.boneMap = JSON.parse( JSON.stringify( this.app.boneMap ) );
            this.app.ik_configurer_left = new GeometricArmIK(this.app.skeletonVisible, this.config, true);
        
        }); // close dialog
        panel.merge();
    }

    bodyLocations( panel ) {
        panel.branch("Edit Modes", {icon: "fa-solid fa-pen-to-square"});

        panel.addTextArea(null, "Select a point: shift + click\nCommit changes to point: alt + click", null, {disabled: true});
        panel.addText("Point", null, null, {disabled: true});
        
        let s = panel.addNumber("Points Scale", 1.0, (value) => {
            this.app.configurerHelper.setScale(value);
        }, {step: 0.1, min: 0.1, max: 1.5});

        panel.addComboButtons("Mode", [
            {
                value: "Mesh Intersection",
                callback: () => { this.app.configurerHelper.setEditMode( 0 ); }
            }, {
                value: "Translation",
                callback: () => { this.app.configurerHelper.setEditMode( 1 ); }
            }, {
                value: "Rotation",
                callback: () => { this.app.configurerHelper.setEditMode( 2 ); }
            }
        ]);

        
        panel.addButton(null, "Toggle Visibility (shift + h)", () => {
            this.app.configurerHelper.toggleVisibility( );
        });

        panel.addButton(null, "Freeze Edit (shift + f)", () => {
            this.app.configurerHelper.toggleFreezeEdit( 2 );
        });

        panel.addButton(null, "Escape Edit Mode (ESC)", () => {
            if ( this.app.configurerHelper.getMode() == ConfigurerHelper._E_MODES.EDIT ){ this.app.configurerHelper.cancelEdit(); }
        });

        panel.merge();
                
        let warned = false;
        
        panel.branch("Edit Bone Map", {closed: true, icon: "fa-solid fa-bone", filter: true});
        panel.addTextArea(null, "Warning! If you change the bone map all your edits will be lost. Adjust this mapping before editing body locations.", null, {disabled: true});

        for (const part in this.app.boneMap) {
            panel.addDropdown(part, this.bones, this.app.boneMap[part], (value, event) => {

                if ( warned ) {
                    this.app.boneMap[part] = value;
                    this.app.configurer.setBoneMap(this.app.boneMap, true);
                    this.app.configurerHelper.computePoints();
                    this.app.configurerHelper.setScale(s.onGetValue());
                }
                else if ( !warned ) {
                    LX.prompt("All your body locations will be lost. Would you like to proceed?", "Warning!", () => {
                        this.app.boneMap[part] = value;
                        this.app.configurer.setBoneMap(this.app.boneMap, true);
                        this.app.configurerHelper.computePoints();
                        this.app.configurerHelper.setScale(s.onGetValue());
                    }, {input: false});
                    warned = true;
                }

            }, {filter: true});
        }       
    }

    actionUnits( panel ) {

        this.AUmap = { }; // {"au": [[part, bs name, factor], ...], ... }
        this.app.facial_configurer.au2bs = this.AUmap;
        this.app.facial_configurer.partsMap = this.partsMap;
        
        panel.branch("Map Blendshapes", {icon: "fa-regular fa-face-smile-wink"});
        
        panel.addDropdown("Action Unit", Object.keys(this.app.facial_configurer.blendshapeMap), undefined, (auName) => {
            if ( !this.AUmap[auName] ) { this.AUmap[auName] = []; }
            
            // remove previous au branch
            if (panel.branches[1]) {
                panel.branches[1].root.remove();
                panel.branches.pop();
                this.cleanBlendshapes();
            }
            
            // create branch
            panel.branch(auName, {icon: "fa-regular fa-face-smile-wink"});
            
            panel.addButton(null, "Add Blendshape", ()=>{
                panel.sameLine();
                let m = this.addBlendshape(panel, auName);
                this.AUmap[auName].push(m);
                panel.endLine();
            });


            // fill branch
            for ( let i = 0; i < this.AUmap[auName].length; i++ ) {
                let m = this.AUmap[auName][i];
                try { m[0].onGetValue(); }
                catch {
                    this.AUmap[auName].splice(i, 1);
                    i--;
                    continue;

                }

                let bsName = m[0].onGetValue();
                let factor = m[1].onGetValue();
                            
                panel.sameLine();
                let p = this.addBlendshape(panel, auName, bsName, factor);
                this.AUmap[auName][i] = p;
                panel.endLine();
            }

            for (let i = 0; i < this.app.facial_configurer.blendshapeMap[auName].length; i++) {
                panel.sameLine();
                let m = this.addBlendshape(panel, auName, this.app.facial_configurer.blendshapeMap[auName][i][0], this.app.facial_configurer.blendshapeMap[auName][i][1]);
                this.AUmap[auName].push(m);
                panel.endLine();
            }
            this.app.facial_configurer.blendshapeMap[auName] = [];
            
            this.preview(auName);
        }, {filter: true});

    }

    
    addBlendshape(panel, auName, bsName = undefined, factorValue = 1.0) {
        let m = [];
    
        m[0] = panel.addDropdown(null, Object.keys(this.app.facial_configurer.blendshapes), bsName, (bsName) => {
            this.preview(auName);
            
            let parts = this.app.facial_configurer.blendshapes[bsName];

            for (let j = 0; j < parts.length; j++) {
                let part = parts[j].name;
                if ( !this.partsMap[part] ) this.partsMap[part] = [];
                if ( !this.partsMap[part].includes(auName) ) this.partsMap[part].push(auName);
            }
            
        }, {filter: true});

        m[1] = panel.addNumber("Factor", factorValue, () => {
            this.preview(auName);
        }, {step: 0.01, min: -1, max: 1});
        
        
        panel.addButton(null, "<a class='lexicon fa-solid fa-trash'></a>", (value, event) => {
            let bs = event.currentTarget.parentElement.parentElement.innerText.split(/\n/)[0];
            for (let i = 0; i < this.AUmap[auName].length; i++) {
                try {
                    if ( this.AUmap[auName][i][0].onGetValue() === bs) {
                        this.AUmap[auName].splice(i, 1);
                    }
                }
                catch {
                    this.AUmap[auName].splice(i, 1);
                }
            }
            
            event.currentTarget.parentElement.parentElement.remove();
            this.preview(auName);
        });

        return m;
    }   

    cleanBlendshapes() {
        for( const partName in this.app.facial_configurer.avatarParts){
            let part = this.app.facial_configurer.avatarParts[partName];
            part.morphTargetInfluences.fill(0.0);
        }
    }

    preview(currentAU) {
        this.cleanBlendshapes();
        for( let i = 0; i < this.AUmap[currentAU].length; ++i){
            let m = this.AUmap[currentAU][i];
            try { m[0].onGetValue() }
            catch { continue; }
            let bsName = m[0].onGetValue();
            let factor = m[1].onGetValue();
            let part = this.app.facial_configurer.blendshapes[bsName];
            for (let j = 0; j < part.length; j++) {
                part[j].morphTargetInfluences[ part[j].morphTargetDictionary[bsName] ] = factor;
            }
        }
    }

    miscellaneous( panel ) {
        panel.refresh = () => {
            panel.clear();
            panel.branch("Action Units of Avatar Parts");
            panel.addTextArea(null, "Here you can select which Action Units affect each mesh of your avatar. If the list is empty all action units will be taken into account. This is an optional step.", null, {disabled: true, fitHeight: true});
            panel.addBlank(5);
            
            for (const partName in this.app.facial_configurer.avatarParts) {
                panel.addArray(partName, this.partsMap[partName], (value) => {
                    this.partsMap[partName] = value;
                }, {filter: true, innerValues: Object.keys(this.app.facial_configurer.blendshapeMap)});
                panel.addBlank(10);
            }
            
            panel.branch("Arm Angles");
            let str = 
            "The application computes default angles that are applied when moving the arms. However, if the result is not as desired you can specify some angles that will be added to the default.\n\n"
            + "- Elbow Raise is the value of the angle of separation between the elbow and the avatar's torso.\n\n"
            + "- Shoulder Raise and Shoulder Hunch:\n \t1. Default angle in rest position\n \t2. Extra negative angle\n \t3. Extra positive angle";
            panel.addTextArea(null, str, null, {disabled: true, fitHeight: true});
            panel.addBlank(5);

            panel.addNumber("Elbow Raise", this.config.elbowRaise * 180 / Math.PI, (value) => {
                this.config.elbowRaise = value * Math.PI / 180;
            }, {step: 1, min: -360, max: 360});            
            panel.addVector3("Shoulder Raise", this.config.shoulderRaise.map((x) => x * 180 / Math.PI), (value, event) => {
                if ( value[1] > 0) {
                    value[1] = 0;
                    panel.widgets["Shoulder Raise"].onSetValue(value);
                }
                if ( value[2] < 0) {
                    value[2] = 0;
                    panel.widgets["Shoulder Raise"].onSetValue(value);
                }
                this.config.shoulderRaise = value.map((x) => x * Math.PI / 180);
            });
            panel.addVector3("Shoulder Hunch", this.config.shoulderHunch.map((x) => x * 180 / Math.PI), (value, event) => {
                if ( value[1] > 0) {
                    value[1] = 0;
                    panel.widgets["Shoulder Hunch"].onSetValue(value);
                }
                if ( value[2] < 0) {
                    value[2] = 0;
                    panel.widgets["Shoulder Hunch"].onSetValue(value);
                }
                this.config.shoulderHunch = value.map((x) => x * Math.PI / 180);
            });
        };
        panel.refresh();
    }
   
    addExport(panel) {
        panel.addButton(null, "Export", () => {
            
            LX.prompt("File name", "Export Config File", (v) => {
                // export
                let configurerJSON = this.app.configurer.exportJSON();
                configurerJSON._comments = "All points are in mesh space (no matrices of any kind are applied)"
                configurerJSON.fingerAxes._comments = "Axes in mesh space. Quats = quats from where axes where computed (tpose). Thumb has a correction Thumb quat = qCorrection * qBind";
        
                configurerJSON._commentsDefaultAngles = "elbow added. shoulder=[ added angle, min angle (<0), max angle (>0) ]",
                configurerJSON.elbowRaise = this.config.elbowRaise * 180 / Math.PI; // to degrees
                configurerJSON.shoulderRaise = this.config.shoulderRaise.map((x) => x * 180 / Math.PI);
                configurerJSON.shoulderHunch = this.config.shoulderHunch.map((x) => x * 180 / Math.PI);

                let facial_configurerJSON = this.app.facial_configurer.exportJSON();
                let boneMap = JSON.parse( JSON.stringify( this.app.boneMap ) );
                let json = { _comments: this.app.modelFileName, boneMap: boneMap, faceController: facial_configurerJSON, bodyController: configurerJSON };

                let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent( JSON.stringify( json , (key,value)=>{
                    if ( value && value.isQuaternion ){ return { x:value.x, y:value.y, z:value.z, w:value.w } }
                    else if ( typeof( value ) == "number" ){ return Number( value.toFixed(6) ); }
                    else{ return value; }
                } ) );
                let downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", v + ".json" );
                document.body.appendChild(downloadAnchorNode); // required for firefox
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            }, {input: "Config", required: true});
        });

        panel.merge();
    }

    updatePartMapping() {
        // { "au": [ [bsname, factor], ... ] }
        for ( const au in this.AUmap) {
            for ( let i = 0; i < this.AUmap[au].length; i++ ) {
                try { this.AUmap[au][i][0].onGetValue() }
                catch {
                    this.AUmap[au].splice(i, 1); // delete empty au's
                    i--;
                    continue;
                }
                
                let bsName = this.AUmap[au][i][0].onGetValue();
                let parts = this.app.facial_configurer.blendshapes[bsName];

                for (let j = 0; j < parts.length; j++) {
                    let part = parts[j].name;
                    if ( !this.partsMap[part] ) this.partsMap[part] = [];
                    if ( !this.partsMap[part].includes(au) ) this.partsMap[part].push(au);
                }
            }
        }
    }

    onClick(value) {
        this.cleanBlendshapes();

        if (value === "Body Locations") {
            // change chroma color
            this.app.scene.getObjectByName("Chroma").material.color.set(0x141455); // css works in sRGB

            // show (body) configurer helper
            this.app.configurerHelper.setVisibility(true);
            this.app.skeletonhelper.visible = true;
            this.app.configurerHelper.mode = ConfigurerHelper._E_MODES.EDIT;
            
            // hide miscellaneous transform controls
            this.app.sphereIk.visible = false;    
            this.app.miscTransformControls.visible = false;
            this.app.miscMode = false;
            this.app.skeletonVisible.pose();
        }
        else if (value === "Action Units") {
            // change chroma color
            this.app.scene.getObjectByName("Chroma").material.color.set(0x2766cc); // css works in sRGB
            
            // hide (body) configurer helper
            this.app.configurerHelper.setVisibility(false);
            this.app.skeletonhelper.visible = false;
            this.app.configurerHelper.cancelEdit();
            this.app.configurerHelper.mode = ConfigurerHelper._E_MODES.NONE;
            
            // preview selected action unit
            try { this.preview(this.panelB.widgets["Action Unit"].onGetValue()); }
            catch {}
            
            // hide miscellaneous transform controls
            this.app.sphereIk.visible = false;    
            this.app.miscTransformControls.visible = false;
            this.app.miscMode = false;
            this.app.skeletonVisible.pose();
        }
        else if (value === "Miscellaneous") {
            // change chroma color
            this.app.scene.getObjectByName("Chroma").material.color.set(0xff1999); // css works in sRGB
            
            // hide (body) configurer helper
            this.app.configurerHelper.setVisibility(false);
            this.app.skeletonhelper.visible = false;
            this.app.configurerHelper.cancelEdit();
            this.app.configurerHelper.mode = ConfigurerHelper._E_MODES.NONE;
            
            // show miscellaneous transform controls
            this.app.sphereIk.visible = true;    
            this.app.miscMode = true;
            this.app.miscTransformControls.visible = true;    
        }
        
        this.panelC.refresh();
    }
}

export { AppGUI };