import * as THREE from "three"
import { App } from "./App.js";
import { ConfigurerHelper } from "./Configurer.js";
import { LX } from 'lexgui';

class AppGUI{
    constructor( app ){
        this.app = app;

        // take canvas from dom, detach from dom, attach to lexgui 
        this.app.renderer.domElement.remove(); // removes from dom
        let main_area = LX.init();
        main_area.attach( this.app.renderer.domElement );
        
        this.gui = null;
        
        this.bones = [];
        this.app.skeleton.bones.forEach((obj) => { this.bones.push(obj.name); }); // get bone names of avatar
        
        var [left_area, right_area] = main_area.split({sizes: ["25%", "75%"]});
        var [left_area, export_area] = left_area.split({type: "vertical", sizes: ["96%", "4%"]});
        
        const leftTabs = left_area.addTabs();

        this.panelA = new LX.Panel();
        // this.bodyLocations( this.panelA );
        leftTabs.add( "Body Locations", this.panelA, {onSelect: () => this.onClick("Body Locations")} );

        var panelB = new LX.Panel();
        this.actionUnits( panelB );
        leftTabs.add( "Action Units", panelB, {onSelect: () => this.onClick("Action Units") });

        var panelC = new LX.Panel();
        
        this.miscellaneous( panelC );
        leftTabs.add( "Miscellaneous", panelC, {onSelect: () => this.onClick("Miscellaneous")} );

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
    }

    refresh(){
        this.gui.refresh();
    }
    
    boneMapping( panel ) {
        let htmlStr = "Select the corresponding bone name of your avatar to match the provided list of bone names. An automatic selection is done, adjust if needed.";
        panel.addTextArea(null, htmlStr, null, {disabled: true, fitHeight: true});
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
            panel.clear();
            this.dialogClosable.root.remove();

            this.app.configurer.setBoneMap(this.app.boneMap);
            this.app.configurerHelper = new ConfigurerHelper( this.app.configurer, this.app.camera, this.app.renderer.domElement );
            this.app.configurerHelper.transformControls.addEventListener( "dragging-changed", (e)=>{ this.app.controls.enabled = !e.value; } );

            this.app.renderer.domElement.addEventListener( "pointermove", (e)=>{
                this.app.configurerHelper.mouse.x = ( e.offsetX / this.app.renderer.domElement.parent.size[0] ) * 2 - 1;
                this.app.configurerHelper.mouse.y = - ( e.offsetY / this.app.renderer.domElement.parent.size[1] ) * 2 + 1;
            });

            this.bodyLocations(this.panelA);

        }); // close dialog
        panel.merge();
    }

    bodyLocations( panel ) {
        panel.branch("Edit Modes", {icon: "fa-solid fa-pen-to-square"});
        panel.addComboButtons("Mode", [
            {
                value: "Mesh Intersection",
                callback: (value, event) => {
                    this.app.configurerHelper.setEditMode( 0 ); 
                }
            }, {
                value: "Translation",
                callback: (value, event) => {
                    this.app.configurerHelper.setEditMode( 1 );
                }
            }, {
                value: "Rotation",
                callback: (value, event) => {
                    this.app.configurerHelper.setEditMode( 2 );
                }
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

        // panel.addText("Point", this.app.configurer.getPointHovered() );

        panel.branch("Edit Bone Map", {closed: true, icon: "fa-solid fa-bone", filter: true});
        let htmlStr = "Select the corresponding bone name of your avatar to match the provided list of bone names. An automatic selection is done, adjust if needed.";
        panel.addTextArea(null, htmlStr, null, {disabled: true, fitHeight: true});
        for (const part in this.app.boneMap) {
            panel.addDropdown(part, this.bones, this.app.boneMap[part], (value, event) => {
                this.app.boneMap[part] = value;
                this.app.configurer.setBoneMap(this.app.boneMap);
                this.app.configurerHelper.computePoints( );
            }, {filter: true});
        }       
    }

    actionUnits( panel ) {

        this.AUmap = { }; // {"au": [[part, bs name, factor], ...], ... }
        this.app.facial_configurer.au2bs = this.AUmap;

        panel.branch("Map Blendshapes", {icon: "fa-regular fa-face-smile-wink"});
        
        panel.addDropdown("Action Unit", Object.keys(this.app.facial_configurer.blendshapeMap), undefined, (auName) => {
            if ( !this.AUmap[auName] ) this.AUmap[auName] = [];
            
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
                let bsName = m[1].onGetValue();
                let factor = m[2].onGetValue();
                            
                panel.sameLine();
                let p = this.addBlendshape(panel, auName, bsName, factor);
                p[0] = m[0];
                this.AUmap[auName][i] = p;
                panel.endLine();
            }

            this.preview(auName);
                            
        }, {filter: true});
    
    }

    
    addBlendshape(panel, auName, bsName = undefined, factorValue = 1.0) {
        let m = [];
        m[1] = panel.addDropdown(null, Object.keys(this.app.facial_configurer.blendshapes), bsName, (bsName) => {
            m[0] = this.app.facial_configurer.blendshapes[bsName];
            this.preview(auName);
        }, {filter: true});

        m[2] = panel.addNumber("Factor", factorValue, () => {
            this.preview(auName);
        }, {step: 0.01, min: -1, max: 1});
        
        
        panel.addButton(null, "<a class='lexicon fa-solid fa-trash'></a>", (value, event) => {
            let bs = event.currentTarget.parentElement.parentElement.innerText.split(/\n/)[0];
            for (let i = 0; i < this.AUmap[auName].length; i++) {
                if ( this.AUmap[auName][i][1].onGetValue() === bs) {
                    this.AUmap[auName].splice(i, 1);
                }
            }
            
            event.currentTarget.parentElement.parentElement.remove(); // todo: remove from list
            this.preview(auName);
        });

        return m;
    }   

    cleanBlendshapes() {
        for( let i = 0; i < this.app.facial_configurer.avatarParts.length; ++i){
            let part = this.app.facial_configurer.avatarParts[i];
            part.morphTargetInfluences.fill(0.0);
        }
    }

    preview(currentAU) {
        this.cleanBlendshapes();
        for( let i = 0; i < this.AUmap[currentAU].length; ++i){
            let m = this.AUmap[currentAU][i];
            let part = m[0];
            if (part) {
                let bsName = m[1].onGetValue();
                let factor = m[2].onGetValue();
                for (let j = 0; j < part.length; j++) {
                    part[j].morphTargetInfluences[ part[j].morphTargetDictionary[bsName] ] = factor;
                }
            }
        }
    }

    miscellaneous( panel ) {
            
    }
   
    addExport(panel) {
        panel.addButton(null, "Export", () => {
            
            LX.prompt("File name", "Export Config File", (v) => {
                // export
                let configurerJSON = this.app.configurer.exportJSON(this.app.boneMap);
                configurerJSON._comments = "All points are in mesh space (no matrices of any kind are applied)"
                configurerJSON.fingerAxes._comments = "Axes in mesh space. Quats = quats from where axes where computed (tpose). Thumb has a correction Thumb quat = qCorrection * qBind";
                let facial_configurerJSON = this.app.facial_configurer.exportJSON();
                let json = { _comments: this.app.modelFileName, bodyController: configurerJSON, facialController: facial_configurerJSON };

                let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent( JSON.stringify( json , (key,value)=>{
                    if ( value.isQuaternion ){ return { x:value.x, y:value.y, z:value.z, w:value.w } }
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

    onClick(value) {
        if (value === "Body Locations") {
            this.app.scene.getObjectByName("Chroma").material.color.set(0x141455); // css works in sRGB
            this.app.configurerHelper.setVisibility(true);
            this.app.skeletonhelper.visible = true;
        }
        else if (value === "Action Units") {
            this.app.scene.getObjectByName("Chroma").material.color.set(0x2766cc); // css works in sRGB
            this.app.configurerHelper.setVisibility(false);
            this.app.skeletonhelper.visible = false;
        }
        else if (value === "Miscellaneous") {
            this.app.scene.getObjectByName("Chroma").material.color.set(0xff1999); // css works in sRGB
            this.app.configurerHelper.setVisibility(false);
            this.app.skeletonhelper.visible = true;
        }
    }
}

export { AppGUI };

