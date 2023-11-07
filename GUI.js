import * as THREE from "three"
import { App } from "./App.js";

class AppGUI{
    constructor( app ){
        this.app = app;

        // take canvas from dom, detach from dom, attach to lexgui 
        this.app.renderer.domElement.remove(); // removes from dom
        let main_area = LX.init();
        main_area.attach( this.app.renderer.domElement );
        
        this.gui = null;
        
        this.boneMap = {
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
        };

        this.bones = [];
        this.app.skeleton.bones.forEach((obj) => { this.bones.push(obj.name); }); // get bone names of avatar
        
        var [left_area, right_area] = main_area.split({sizes: ["25%", "75%"]});

        const leftTabs = left_area.addTabs();

        var panelA = new LX.Panel();
        // this.fillPanelA( panelA );
        leftTabs.add( "Body Locations", panelA, {onSelect: () => this.onClick("Body Locations")} );

        var panelC = new LX.Panel();
        this.fillPanelC( panelC );
        leftTabs.add( "Action Units", panelC, {onSelect: () => this.onClick("Action Units")} );

        var panelB = new LX.Panel();

        this.fillPanelB( panelB );
        leftTabs.add( "Miscellaneous", panelB, {onSelect: () => this.onClick("Miscellaneous")} );

        // add canvas to left upper part
        var canvas = document.getElementById("canvas");
        right_area.attach(canvas);
        canvas.width = right_area.root.clientWidth;
        canvas.height = right_area.root.clientHeight;
        canvas.style.width = "100%";
        canvas.style.height = "100%";

        let that = this;
        right_area.onresize = function( bounding ) {
            canvas.width = bounding.width;
            canvas.height = bounding.height;
            that.app.onResize();
        };

        this.dialogClosable = new LX.Dialog("Bone Mapping", p => { this.fillPanelA(p); }, { size: ["80%", "70%"], closable: false });
    }

    refresh(){
        this.gui.refresh();
    }

    addExport(panel) {
        panel.addButton(null, "Export", () => {
            // export
            let configurerJSON = this.app.configurer.exportJSON();
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
            downloadAnchorNode.setAttribute("download", "config.json" );
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });
    }
    createPanel(){

        new LX.PocketDialog( "Controls", p => {
            this.gui = p;

            this.gui.refresh = () =>{
                this.gui.clear();
            }
            this.gui.refresh();
            // p.merge(); // end of customization

        }, { size: ["50%", null], float:"left", draggable:false});

    }
    
    fillPanelA( panel ) {
        // panel.branch("Bone Map");
        let htmlStr = "Select the corresponding bone name of your avatar to match the provided list of bone names. An automatic selection is done, adjust if needed.";
        panel.addTextArea(null, htmlStr, null, {disabled: true, fitHeight: true});
        let i = 0;
        for (const part in this.boneMap) {
            if ((i % 2) == 0) panel.sameLine(4);
            i++;
            panel.addDropdown(part, this.bones, this.boneMap[part], (value, event) => {
                this.boneMap[part] = value;
            });
        }

        panel.addBlank(10);
        panel.addButton(null, "Next", () => { panel.clear(); this.dialogClosable.root.remove(); }); // close dialog
        panel.merge();
    }

    fillPanelB( panel ) {
            
            panel.branch("Canvas", {icon: "fa-solid fa-palette", filter: true});
            panel.addColor("Background", "#b7a9b1");
            panel.addText("Text", "Lexgui.js @jxarco", null, {placeholder: "e.g. ColorPicker", icon: "fa fa-font"});
            panel.addColor("Font Color", [1, 0.1, 0.6], (value, event) => {
                console.log("Font Color: ", value);
            });
            panel.addNumber("Font Size", 36, (value, event) => {
                console.log(value);
            }, { min: 1, max: 48, step: 1});
            panel.addVector2("2D Position", [250, 350], (value, event) => {
                console.log(value);
            }, { min: 0, max: 1024 });

            panel.branch("File");
            panel.addText("Name", "config.js");
            this.addExport(panel);
            panel.merge();
    }
    
    fillPanelC( panel ) {
            
            panel.branch("Settings", {icon: "fa-solid fa-palette", filter: true});
            panel.addTitle("Configuration (Im a title)");
            panel.addCheckbox("Toggle me", true, (value, event) => {
                console.log(value);
            }, { suboptions: (p) => {
                p.addText(null, "Suboption 1");
                p.addNumber("Suboption 2", 12);
            } });
            panel.addFile("Image", data => { console.log(data) }, {} );

            panel.branch("File");
            panel.addText("Name", "config.js");
            this.addExport(panel);
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

