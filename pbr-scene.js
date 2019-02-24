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
      const indirectLight = engine.createIblFromKtx(this.getAssetAttribute("indirect-map"));
      scene.setIndirectLight(indirectLight);
      indirectLight.setIntensity(this.getFloatAttribute("intensity",100000));
    }
    if(this.hasAttribute("sky-map")){
      const skybox = engine.createSkyFromKtx(this.getAssetAttribute("sky-map"));
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

  build(engine,scene,view,sampler){
    const material = engine.createMaterial(this.getAssetAttribute("material"));
    const matinstance = material.createInstance();
    if(this.hasAttribute("albedo")){
      const albedo = engine.createTextureFromKtx(this.getAssetAttribute("albedo"), {srgb: true});
      matinstance.setTextureParameter('albedo', albedo, sampler)
    }
    if(this.hasAttribute("roughness")){
      const roughness = engine.createTextureFromKtx(this.getAssetAttribute("roughness"), {srgb: true});
      matinstance.setTextureParameter('roughness', roughness, sampler)
    }
    if(this.hasAttribute("metallic")){
      const metallic = engine.createTextureFromKtx(this.getAssetAttribute("metallic"), {srgb: true});
      matinstance.setTextureParameter('metallic', metallic, sampler)
    }
    if(this.hasAttribute("normal")){
      const normal = engine.createTextureFromKtx(this.getAssetAttribute("normal"), {srgb: true});
      matinstance.setTextureParameter('normal', normal, sampler)
    }
    if(this.hasAttribute("ao")){
      const ao = engine.createTextureFromKtx(this.getAssetAttribute("ao"), {srgb: true});
      matinstance.setTextureParameter('ao', ao, sampler)
    }
    const mesh = engine.loadFilamesh(this.getAssetAttribute("mesh"), matinstance);
    return mesh.renderable;
  }
}
window.customElements.define('pbr-model', PBRModel);
