class PBRScene extends HTMLElement {
  connectedCallback(){
    setTimeout(()=>{
      let assets = this.getAssetURLs();
      this.assets = {};
      assets.forEach(x=>this.assets[x.name] = x.src);
      Filament.init(assets.map(x=>x.src),this.onLoaded.bind(this));
    },100)
  }

  onLoaded(){
    this.width = parseInt(this.getAttribute("width")) || 500;
    this.height = parseInt(this.getAttribute("height")) || 500;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.appendChild(this.canvas);
    this.engine = Filament.Engine.create(this.canvas);
    this.scene = this.engine.createScene();
    this.sampler = new Filament.TextureSampler(
        Filament.MinFilter.LINEAR_MIPMAP_LINEAR,
        Filament.MagFilter.LINEAR,
        Filament.WrapMode.CLAMP_TO_EDGE);
    this.swapChain = this.engine.createSwapChain();
    this.renderer = this.engine.createRenderer();
    this.view = this.engine.createView();
    this.view.setScene(this.scene);
    window.requestAnimationFrame(this.render.bind(this));
    this.dispatchEvent(new Event("pbr-scene-loaded"));
  }

  getAssetURLs(){
    return Array.from(document.querySelectorAll("pbr-asset")).map(x=>({name:x.getAttribute("name"), src:x.getAttribute("src")}))
  }

  render(){
    this.renderer.render(this.swapChain, this.view);
    window.requestAnimationFrame(this.render.bind(this));
  }

  resize() {
    this.dispatchEvent(new Event("pbr-resized"));
  }
}
window.customElements.define('pbr-scene', PBRScene);


class PBRBaseElement extends HTMLElement {
  connectedCallback(){
    let p = this.parentNode;
    while(p !== window.document.body){
      if(p.tagName === "PBR-SCENE"){
        this.sceneElement = p;
      }
      p = p.parentNode;
    }
    if(!this.sceneElement){
      console.error("This element needs to be in a pbr-scene");
    }
    this.sceneElement.addEventListener("pbr-scene-loaded",this.load.bind(this));
  }

  load(){
    let scene = this.sceneElement.scene;
    let engine = this.sceneElement.engine;
    let view = this.sceneElement.view;
    let sampler = this.sceneElement.sampler;
    this.entity = this.build(engine,scene,view,sampler);
    scene.addEntity(this.entity);
  }

  attributeChangedCallback(){
    if(this.entity){
      let scene = this.sceneElement.scene;
      let engine = this.sceneElement.engine;
      scene.remove(this.entity);
      this.entity = this.build(engine,scene);
      scene.addEntity(this.entity);
    }
  }

  hasAttribute(name){
    let a = this.getAttribute(name);
    return a !== null && a !== undefined;
  }

  getAssetAttribute(name){
    let a = this.getAttribute(name);
    if(!a){
      throw new Error("Could not find attribute: "+name+" on "+this.tagName)
    }
    let assetURL = this.sceneElement.assets[a];
    if(!assetURL){
      throw new Error("Could not find asset with id: "+a)
    }
    return assetURL;
  }

  getColorAttribute(name,defaultValue){
    let a = this.getAttribute(name);
    if(a){
     let m = a.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
     if( m) {
         return [m[1]/255,m[2]/255,m[3]/255];
     }
    }
    return defaultValue;
  }

  getVec3Attribute(name,defaultValue){
    let a = this.getAttribute(name);
    if(a){
     let m = a.split(",")
     if( m) {
         return [parseFloat(m[0]),parseFloat(m[1]),parseFloat(m[2])];
     }
    }
    return defaultValue;
  }

  getBooleanAttribute(name,defaultValue){
    let a = this.getAttribute(name);
    if(a){
      return a === "true"
    }
    return defaultValue;
  }

  getFloatAttribute(name,defaultValue){
    let a = this.getAttribute(name);
    if(a){
      return parseFloat(a);
    }
    return defaultValue;
  }
}

class PBRSun extends PBRBaseElement {
  constructor(){
    super();
  }

  static get observedAttributes() {
    return ['color', 'intensity', 'direction', 'shadows', 'radius', 'halo-size', 'halo-falloff'];
  }

  build(engine,scene){
    const sunlight = Filament.EntityManager.get().create();
    Filament.LightManager.Builder( Filament.LightManager$Type.SUN)
        .color(this.getColorAttribute("color",[0.98, 0.92, 0.89]))
        .intensity(this.getFloatAttribute("intensity",100000.0))
        .direction(this.getVec3Attribute("direction",[0.6, -1.0, -0.8]))
        .castShadows(this.getBooleanAttribute("shadows",true))
        .sunAngularRadius(this.getFloatAttribute("radius",1.9))
        .sunHaloSize(this.getFloatAttribute("halo-size",10.0))
        .sunHaloFalloff(this.getFloatAttribute("halo-falloff",80.0))
        .build(engine, sunlight);
    return sunlight
  }
}
window.customElements.define('pbr-sun', PBRSun);


class PBREnvironment extends PBRBaseElement {
  constructor(){
    super();
  }

  static get observedAttributes() {
    return ['intensity','indirect-map','sky-map'];
  }

  load(){
    let scene = this.sceneElement.scene;
    let engine = this.sceneElement.engine;
    this.build(engine,scene);
    this.loaded = true;
  }

  build(engine,scene){
    if(this.hasAttribute("indirect-map")){
      let url = this.getAssetAttribute("indirect-map");
      if(url.indexOf(".ktx") == -1){
        throw new Error("your skybox needs to be of type .ktx, use the default skybox or generate your own with cmgen")
      }
      const indirectLight = engine.createIblFromKtx(url);
      scene.setIndirectLight(indirectLight);
      indirectLight.setIntensity(this.getFloatAttribute("intensity",100000));
    }
    if(this.hasAttribute("sky-map")){

      let url = this.getAssetAttribute("sky-map");
      if(url.indexOf(".ktx") == -1){
        throw new Error("your skybox needs to be of type .ktx, use the default skybox or generate your own with cmgen")
      }
      const skybox = engine.createSkyFromKtx(url);
      scene.setSkybox(skybox);
    }
  }

  attributeChangedCallback(){
    if(this.loaded){
      let scene = this.sceneElement.scene;
      let engine = this.sceneElement.engine;
      this.build(engine,scene);
    }
  }
}
window.customElements.define('pbr-environment', PBREnvironment);

class PBRCamera extends PBRBaseElement {
  constructor(){
    super();
  }

  static get observedAttributes() {
    return [''];
  }

  connectedCallback(){
    PBRBaseElement.prototype.connectedCallback.call(this);
    this.sceneElement.addEventListener("pbr-resized",this.onResize.bind(this))
  }

  load(){
    let scene = this.sceneElement.scene;
    let engine = this.sceneElement.engine;
    let view = this.sceneElement.view;
    this.build(engine,scene,view);
    this.loaded = true;
  }

  build(engine,scene,view){
    this.camera = engine.createCamera();
    view.setCamera(this.camera);
    this.updateCameraView();
  }

  onResize(){
    this.updateCameraView();
  }

  updateCameraView(){
    if(this.camera){
      this.sceneElement.view.setViewport([0, 0, this.sceneElement.width, this.sceneElement.height]);
      const eye = [0, 0, 4], center = [0, 0, 0], up = [0, 1, 0];
      this.camera.lookAt(eye, center, up);
      const aspect = this.sceneElement.width / this.sceneElement.height;
      const fov = aspect < 1 ? Filament.Camera$Fov.HORIZONTAL : Filament.Camera$Fov.VERTICAL;
      this.camera.setProjectionFov(45, aspect, 1.0, 10.0, fov);
    }
  }

  attributeChangedCallback(){
    if(this.loaded){
      let scene = this.sceneElement.scene;
      let engine = this.sceneElement.engine;
      this.build(engine,scene);
    }
  }
}
window.customElements.define('pbr-camera', PBRCamera);

class PBRModel extends PBRBaseElement {
  constructor(){
    super();
  }

  static get observedAttributes() {
    return ["material","albedo","mesh","roughness","metallic","normal","ao"];
  }

  loadMaterialTexture(engine,sampler,materialInstance,name){
    if(this.hasAttribute(name)){
      let url = this.getAssetAttribute(name);
      let f = engine.createTextureFromPng;
      if(url.indexOf(".ktx") !== -1){
        f = engine.createTextureFromKtx
      } else if(url.indexOf(".jpg") !== -1){
        f = engine.createTextureFromJpeg
      }
      const tex = f.call(engine,url,{srgb: true});
      materialInstance.setTextureParameter(name, tex, sampler)
    }
  }

  build(engine,scene,view,sampler){
    let matinstance = undefined;
    if(this.hasAttribute("material")){
      let material = engine.createMaterial(this.getAssetAttribute("material"));
      matinstance = material.createInstance();
      this.loadMaterialTexture(engine,sampler,matinstance,"albedo");
      this.loadMaterialTexture(engine,sampler,matinstance,"roughness");
      this.loadMaterialTexture(engine,sampler,matinstance,"metallic");
      this.loadMaterialTexture(engine,sampler,matinstance,"normal");
      this.loadMaterialTexture(engine,sampler,matinstance,"ao");
    }
    const mesh = engine.loadFilamesh(this.getAssetAttribute("mesh"),matinstance);
    const entity = mesh.renderable;

    if(this.hasAttribute("rotation")){
      let r = this.getVec3Attribute("rotation",[0,0,0]);
      const transform = mat4.fromRotation(mat4.create(), 1, [r[0]*Math.PI/180,r[1]*Math.PI/180,r[2]*Math.PI/180]);
      const tcm = engine.getTransformManager();
      const inst = tcm.getInstance(entity);
      tcm.setTransform(inst, transform);
      inst.delete();
    }
    return entity;
  }
}
window.customElements.define('pbr-model', PBRModel);
