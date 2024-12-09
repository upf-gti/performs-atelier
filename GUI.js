import * as THREE from "three"
import { Configurer, ConfigurerHelper } from "./Configurer.js";
import { LX } from 'lexgui';
import { AUConfigurer } from "./AUConfigurer.js";
import { GeometricArmIK } from "./GeometricArmIK.js";

class AppGUI{
    static GuideStage = {
        WELCOME: 0,
        BONE_MAPPING: 1,
        BODY_LOCATIONS: 2,
        ACTION_UNITS: 3,
        MISCELLANEOUS: 4
    };

    constructor( app ){
        this.app = app;

        // take canvas from dom, detach from dom, attach to lexgui 
        this.app.renderer.domElement.remove(); // removes from dom
        this.main_area = LX.init();
        this.main_area.attach( this.app.renderer.domElement );
        
        this.gui = null;
        
        this.bones = [];
        this.configFile = null;
        this.config = { shoulderRaise: [0,0,0], shoulderHunch: [0,0,0], elbowRaise: 0 };
        this.partsMap = {};
        
        this.showGuidedTour(AppGUI.GuideStage.WELCOME);

        this.initDialog = new LX.Dialog("Upload avatar", panel => {
            this.avatarSelect(panel); 
        }, { size: ["40%"], closable: false });
    }

    refresh(){
        this.gui.refresh();
    }

    avatarSelect( panel ) {
        this.avatars = {"Eva": {}, "Ada": {}, "From disk": {}};
        this.avatars["Eva"]["filePath"] = '/3Dcharacters/Eva_Low/Eva_Low.glb'; this.avatars["Eva"]["modelRotation"] = 0;
        this.avatars["Ada"]["filePath"] = '/3Dcharacters/Ada/Ada.glb'; this.avatars["Ada"]["modelRotation"] = 0;
        this.avatars["From disk"]["modelRotation"] = 0;
        
        document.addEventListener('drop', (e) => {
            // if(e.target == panel.widgets["Avatar File"].domEl || e.target == panel.widgets["Config File"].domEl.getElementsByTagName('input')[0]) {
            //     return;
            // }
            e.preventDefault();
			e.stopPropagation();
            
            const files = e.dataTransfer.files; 
            if(!files.length)
                return;
            
            this.character = "From disk"; 
            panel.refresh();
            const event = new Event('change');
            for(let i = 0; i < files.length; i++) {
                const file = files[i];
                const extension = file.name.substr(file.name.lastIndexOf(".") + 1);
                let element = null;
                if (extension == "glb" || extension == "gltf") {
                    element = panel.widgets["Avatar File"].domEl.getElementsByTagName('input')[0];                    
                }
                else if(extension == "json") {
                    element = panel.widgets["Config File"].domEl.getElementsByTagName('input')[0];                    
                }
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file)
                element.files = dataTransfer.files;
                element.dispatchEvent(event);
            }
        });

        this.avatarName = "";

        let afromFile = true;
        let cfromFile = true;
        panel.refresh = () => {
            panel.clear();

            panel.sameLine();
                let avatarFile = panel.addFile("Avatar File", (v, e) => {
                    let files = panel.widgets["Avatar File"].domEl.children[1].files;
                    if(!files.length) {
                        return;
                    }
                    const path = files[0].name.split(".");
                    const filename = path[0];
                    const extension = path[1];
                    if (extension == "glb" || extension == "gltf") { 
                        this.avatarName = this.character = filename;
                        this.avatarFile = v;
                        this.avatars[filename] = {"filePath": v};
                    }
                    else { LX.popup("Only accepts GLB and GLTF formats!"); }
                }, {type: "url", nameWidth: "41%"});

                if(!afromFile) {
                    avatarFile.domEl.classList.add('hidden');
                }

                let avatarURL = panel.addText("Avatar URL", this.avatarFile, (v, e) => {
                    if(v == this.avatarFile) {
                        return;
                    }
                    if(!v) {
                        this.avatarFile = v;
                        return;
                    }

                    const path = v.split(".");
                    let filename = path[path.length-2];
                    filename = filename.split("/");
                    filename = filename.pop();
                    let extension = path[path.length-1];
                    extension = extension.split("?")[0];
                    if (extension == "glb" || extension == "gltf") { 
                        this.avatarName = this.character = filename;
                        this.avatarFile = v;      
                        this.avatars[filename] = {"filePath": v};                       
                    }
                    else { LX.popup("Only accepts GLB and GLTF formats!"); }
                }, {nameWidth: "43%"});
                if(afromFile) {
                    avatarURL.domEl.classList.add('hidden');
                }

                panel.addComboButtons(null, [
                    {
                        value: "From File",
                        callback: (v, e) => {                            
                            afromFile = true;
                            if(!avatarURL.domEl.classList.contains('hidden')) {
                                avatarURL.domEl.classList.add('hidden');          
                            }
                            avatarFile.domEl.classList.remove('hidden');                                                          
                            panel.refresh();
                        }
                    },
                    {
                        value: "From URL",
                        callback: (v, e) => {
                            afromFile = false;
                            if(!avatarFile.domEl.classList.contains('hidden')) {
                                avatarFile.domEl.classList.add('hidden');           
                            }                                               
                            avatarURL.domEl.classList.remove('hidden');          
                        }
                    }
                ], {selected: afromFile ? "From File" : "From URL", width: "170px", minWidth: "0px"});                
                panel.endLine();
            
                panel.branch("Optional");

                panel.sameLine();
                let configFile = panel.addFile("Config File", (v, e) => {
                
                    const filename = panel.widgets["Config File"].domEl.children[1].files[0].name;
                    let extension = filename.split(".");
                    extension = extension.pop();
                    if (extension == "json") { 
                        this.configFile = JSON.parse(v); 
                        this.configFile._filename = filename; 
                    }
                    else { LX.popup("Config file must be a JSON!"); }
                }, {type: "text", nameWidth: "41%"});
                
                let configURL = panel.addText("Config URL", this.configFile ? this.configFile._filename : "", async (v, e) => {
                    if(!v) {
                        return;
                    }
                    const path = v.split(".");
                    let filename = path[path.length-2];
                    filename = filename.split("/");
                    filename = filename.pop();
                    let extension = path[path.length-1];
                    extension = extension.split("?")[0].toLowerCase();
                    if (extension == "json") { 
                        if (extension == "json") { 
                            try {
                                const response = await fetch(v);
                                if (!response.ok) {
                                    throw new Error(`Response status: ${response.status}`);
                                }
                                this.configFile = await response.json();                        
                                this.configFile._filename = v; 
                            }
                            catch (error) {
                                LX.popup(error.message, "File error!");
                            }
                        }
                    }
                    else { LX.popup("Config file must be a JSON!"); }
                }, {nameWidth: "43%"});

                if(cfromFile) {
                    configURL.domEl.classList.add('hidden');
                }else {
                    configFile.domEl.classList.add('hidden');
                }
                panel.addComboButtons(null, [
                    {
                        value: "From File",
                        callback: (v, e) => {                            
                            cfromFile = true;
                            // panel.refresh();
                            if(!configURL.domEl.classList.contains('hidden')) {
                                configURL.domEl.classList.add('hidden');          
                            }
                            configFile.domEl.classList.remove('hidden');                                                          
                        }
                    },
                    {
                        value: "From URL",
                        callback: (v, e) => {
                            cfromFile = false;
                            // panel.refresh();
                            if(!configFile.domEl.classList.contains('hidden')) {
                                configFile.domEl.classList.add('hidden');           
                            }                                               
                            configURL.domEl.classList.remove('hidden');  
                        }
                    }
                ], {selected: cfromFile ? "From File" : "From URL", width: "170px", minWidth: "0px"});
                panel.endLine();
                panel.merge();

            panel.addButton(null, "Next", async () => {
                if (this.avatars[this.character] && this.avatars[this.character]["filePath"]) {
                    if( typeof(this.avatars[this.character]["filePath"]) == 'string' && this.avatars[this.character]["filePath"].includes('models.readyplayer.me') ) {
                        this.avatars[this.character]["filePath"]+= '?pose=T&morphTargets=ARKit&lod=1';
                        if(!this.configFile) {
                            try {
                                const response = await fetch("https://webglstudio.org/3Dcharacters/ReadyEva/ReadyEva.json");
                                if (!response.ok) {
                                    throw new Error(`Response status: ${response.status}`);
                                }
                                const config = await response.json();                        
                                this.configFile = {boneMap: config.boneMap};
                            }
                            catch (error) {
                                //LX.popup(error.message, "File error!");
                            }
                        }
                    }
                    if(!this.avatars[this.avatarName]["modelRotation"]) {
                        this.avatars[this.avatarName]["modelRotation"] = 0;
                    }
                    if(!this.configFile) {
                        this.configFile = {};
                    }
                    panel.clear(); this.initDialog.root.remove();
                    $('#loading').fadeIn(); //show();
                    this.createPanel();
                    this.showGuidedTour(AppGUI.GuideStage.BONE_MAPPING);
                }
                else {
                    LX.popup("Select an avatar!");
                }
            }, {className: "next-button"});
        }
        panel.refresh();
    }

    createPanel() {
        var [left_area, right_area] = this.main_area.split({sizes: ["25%", "75%"]});
        var [left_area, export_area] = left_area.split({type: "vertical", sizes: ["96%", "4%"]});
        
        const leftTabs = left_area.addTabs();

        this.panelA = new LX.Panel();
        leftTabs.add( "Body Locations", this.panelA, {onSelect: () => this.onClick("Body Locations")} );
        
        this.panelB = new LX.Panel();
        leftTabs.add( "Action Units", this.panelB, {onSelect: () => this.onClick("Action Units") });

        this.panelC = new LX.Panel();
        leftTabs.add( "Miscellaneous", this.panelC, {onSelect: () => this.onClick("Miscellaneous")} );
        
        var panelD = new LX.Panel();
        export_area.attach(panelD);

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
        
        let modelRotation = (new THREE.Quaternion()).setFromAxisAngle( new THREE.Vector3(1,0,0), this.avatars[this.character]["modelRotation"] );

        this.app.loadVisibleModel(this.avatars[this.character]["filePath"], modelRotation, () => {
            this.app.facial_configurer = new AUConfigurer(this.app.modelVisible, this.app.scene, this.configFile.faceController);
            this.partsMap = this.app.facial_configurer.partsMap;
            this.actionUnits( this.panelB );

            this.app.loadConfigModel(this.avatars[this.character]["filePath"], modelRotation, () => {
                if (this.avatarFile) this.app.modelFileName = this.avatarFile;
                
                this.app.skeleton.bones.forEach((obj) => { this.bones.push(obj.name); }); // get bone names of avatar
                this.miscellaneous( this.panelC );
                this.addExport(panelD);

                this.showBoneMapping();
            });
        });
    }

    showBoneMapping() {
        if(this.dialog) {
            this.dialog.close();
        }
        const areaMap = new LX.Area({width: "100%"});
        const [area3D, areaPanel] = areaMap.split({type:'horizontal', sizes: ["50%", "50%"]});

        const bonePanel = areaPanel.addPanel({id:"bone-panel"});

        // fill automatically or from config file
        if ( this.configFile.boneMap ) { this.app.boneMap = this.configFile.boneMap; }
        else { this.app.autoMapBones(); }
        
        const bones = this.app.skeleton.bones;
        let bonesName = [];
        for(let i = 0; i < bones.length; i++) {
            bonesName.push(bones[i].name);
        }
        const area = new LX.Area({width: "100%", height: "95%"});
        const area2D = new LX.Area();

        this.dialog = new LX.Dialog("Bone Mapping", panel => { 
            
            panel.root.appendChild(area.root);
            
            // 3D mapping
            this.createBonePanel(bonePanel);
            //2D mapping
            const p = area2D.addPanel();
            this.create2DPanel(p, bonesName);
            
            //panel.root.prepend(area.root);
            const tabs = area.addTabs();
            tabs.add("3D mapping", areaMap, {selected: true});
            areaMap.root.style.display = "flex";
            tabs.add("2D mapping", area2D, {onSelect: (e, name) => {
                this.create2DPanel(p, bonesName);
            }});

            // next button
            panel.addButton(null, "Next", () => { 
                // make sure all bones are mapped
                for (const bone in this.app.boneMap) {
                    if ( !this.app.boneMap[bone] ) {
                        LX.popup("All bones must be mapped!");
                        return;
                    }
                }

                panel.clear();
                this.dialog.root.remove();

                this.app.configurer.setBoneMap(this.app.boneMap);
                
                if (this.configFile.bodyController){
                    this.app.configurer.computeAxes(this.configFile.bodyController.axes);
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
                
                this.showGuidedTour(AppGUI.GuideStage.BODY_LOCATIONS);
            }); // close dialog
            panel.merge();


        }, { size: ["80%", "70%"], closable: false });      
        
        //3D mapping 
        this.app.boneMapScene.init(area3D.root, this.app.skeleton, this.app.boneMap, (bone) => { this.createBonePanel(bonePanel, bone, bonesName)});
    }

    create2DPanel(panel, bonesName) {
        panel.clear();
        const htmlStr = "Select the corresponding bone name of your avatar to match the provided list of bone names. An automatic selection is done, adjust if needed.";
        panel.addTextArea(null, htmlStr, null, {disabled: true});
        
        let i = 0;
        for (const part in this.app.boneMap) {
            if ((i % 2) == 0) panel.sameLine(2);
            i++;
            const widget = panel.addDropdown(part, bonesName, this.app.boneMap[part], (value, event) => {
                this.app.boneMap[part] = value;                    
            }, {filter: true});
            if(!this.app.boneMap[part]) {
                widget.domEl.classList.add("warning");
            }
            widget.domEl.children[0].classList.add("source-color");
            widget.domEl.children[1].classList.add("target-color");
        }
    }

    createBonePanel(panel, bone, bonesName) {
        panel.clear();
        panel.branch("Retargeting bone map");
        const s = "An automatic mapping is done, adjust if needed. Click on a bone to highlight its corresponding bone on the other skeleton. To edit it, select a bone on one skeleton with the left mouse button, then right-click on the other skeleton to assign a new corresponding bone. This can also be done using the dropdown menu. The source skeleton is displayed in blue, while the target skeleton is shown in white. Bones without a mapping are highlighted in yellow.";
        panel.addTextArea(null, s, null, {disabled: true, fitHeight: true});
        panel.addText("Source", "Target", null, {disabled: true});
        if(bone) {
            const widget = panel.addDropdown(bone.name, bonesName, this.app.boneMap[bone.name], (value, event) => {
                this.app.boneMap[bone.name] = value;  
                this.app.boneMapScene.onUpdateFromGUI(bone.name);                  
            }, {filter: true});
            if(!this.app.boneMap[bone.name]) {
                widget.domEl.classList.add("warning");
            }
            widget.domEl.children[0].classList.add("source-color");
            widget.domEl.children[1].classList.add("target-color");
        }

    }

    bodyLocations( panel ) {
        panel.branch("Edit Modes", {icon: "fa-solid fa-pen-to-square"});

        panel.addTextArea(null, "Select a point: shift + click\nCommit changes to point: alt + click", null, {disabled: true});
        panel.addText("Point", null, null, {disabled: true});
        
        let s = panel.addNumber("Points Scale", 1.0, (value) => {
            this.app.configurerHelper.setScale(value);
        }, {step: 0.01, min: 0.1, max: 3.0});

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
        
        panel.branch("Visible Parts", {closed: true, icon: "fa-solid fa-hat-wizard", filter: true});
        panel.addTextArea(null, "Remove accessories that may interfeer with the automatic/manual computing of body locations.", null, {disabled: true});
        panel.addTextArea(null, "Warning! If you change the selection all your edits will be lost. Adjust this before editing body locations.", null, {disabled: true});

        panel.addButton(null, "Recalculate Points", () => {
            this.app.configurer.computeConfig();
            this.app.configurerHelper.computePoints();
            this.app.configurerHelper.setScale(s.onGetValue());
        });

        for (let i = 0; i < this.app.modelVisible.children[0].children.length; i++) {
            
            let childVisible = this.app.modelVisible.children[0].children[i];
            let child = this.app.model1.children[0].children[i];
            if (child.isBone) { continue; } // no bone
            
            panel.addCheckbox(childVisible.name, true, (value) => {

                child.traverse( (object) => {
                    object.visible = value;
                } );
                childVisible.traverse( (object) => {
                    object.visible = value;
                } );

                child.visible = value;
                childVisible.visible = value;
            });
        }

        panel.merge();

        panel.branch("Edit Bone Map", {closed: true, icon: "fa-solid fa-bone", filter: true});
        panel.addTextArea(null, "Warning! If you change the bone map all your edits will be lost. Adjust this mapping before editing body locations.", null, {disabled: true});
        let warned = false;

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
                    }, {input: false, on_cancel: () => panel.widgets[part].onSetValue(this.app.boneMap[part]) });
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
        
        const url = "https://webglstudio.org/projects/signon/animics";
        const actionUnits = Object.keys(this.app.facial_configurer.blendshapeMap);
        const values = [];
        for(let i = 0; i < actionUnits.length; i++) {
            values.push({ value: actionUnits[i], src: url +"/data/imgs/thumbnails/face lexemes/" + actionUnits[i].toLowerCase().replaceAll('_', ' ') + ".png" })
        }
        panel.addDropdown("Action Unit", values, undefined, (auName) => {
            if ( !this.AUmap[auName] ) { this.AUmap[auName] = []; }
            
            // remove previous au branch
            if (panel.branches[1]) {
                panel.branches[1].root.remove();
                panel.branches.pop();
                this.cleanBlendshapes();
            }
            
            // create branch
            panel.branch(auName, {icon: "fa-regular fa-face-smile-wink"});
            panel.addImage(url +"/data/imgs/thumbnails/face lexemes/" + auName.toLowerCase().replaceAll('_', ' ') + ".png" , {style: {width: "100%"}});
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

            // Example Images of Arm Angles Result:
            let info = 
            "Find attached below an example of how the resulting position with the arm angles adjusted should look like:";
            panel.addTextArea(null, info, null, {disabled: true, fitHeight: true});
 
            let img = document.createElement("img");
            img.src = "./data/imgs/miscellaneous/Arm Angles Example 1.png";
            img.height = 300;
            panel.branches[0].content.appendChild(img);
            let img2 = document.createElement("img");
            img2.src = "./data/imgs/miscellaneous/Arm Angles Example 2.png";
            img2.height = 300;
            panel.branches[0].content.appendChild(img2);
            let img3 = document.createElement("img");
            img3.src = "./data/imgs/miscellaneous/Arm Angles Example 3.png";
            img3.height = 300;
            panel.branches[0].content.appendChild(img3);
        };
        panel.refresh();
    }

    addExport(panel) {
        panel.addButton(null, "Export", () => {
            
            LX.prompt("File name", "Export Config File", (v) => {
                // export
                let configurerJSON = this.app.configurer.exportJSON();
                configurerJSON._comments = "All points are in mesh space (no matrices of any kind are applied)"
                
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
            }, {input: this.avatarName, required: true});
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
            this.app.miscTransformControls.enabled = false;
            this.app.miscMode = false;
            this.app.skeletonVisible.pose();

            // show guide
            this.showGuidedTour(AppGUI.GuideStage.BODY_LOCATIONS);
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
            this.app.miscTransformControls.enabled = false;
            this.app.miscMode = false;
            this.app.skeletonVisible.pose();

            // show guide
            this.showGuidedTour(AppGUI.GuideStage.ACTION_UNITS);
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
            this.app.miscTransformControls.enabled = true;

            // show guide
            this.showGuidedTour(AppGUI.GuideStage.MISCELLANEOUS);
        }
        
        this.panelC.refresh();
    }

    showGuidedTour(stage) {
        const modal = document.getElementById("atelier-guide-modal");
        const modals = document.querySelectorAll("#atelier-guide-modal .container");
    
        // Function to show the current tutorial modal
        const showModal = (stage) => {
            modals.forEach((modalContent, index) => {
                modalContent.classList.toggle("show", index === stage);
                modalContent.classList.toggle("hidden", index !== stage);
            });
            modal.classList.remove("hidden");
        };
    
        // Function to close the modal
        const closeModal = () => {
            modal.classList.add("hidden");
        };

        modals.forEach((modalContent, index) => {
            const buttons = modalContent.getElementsByTagName("button");
    
            // Add event listeners for buttons within each modal
            Array.from(buttons).forEach((btn) => {
                btn.addEventListener("click", () => {
                    closeModal();
                });
            });
    
            // Add close functionality for the "x" icon
            const closeIcon = modalContent.querySelector("span.fa-xmark");
            if (closeIcon) {
                closeIcon.addEventListener("click", () => {
                    closeModal();
                });
            }
        });
    
        showModal(stage);
    }

}

export { AppGUI };