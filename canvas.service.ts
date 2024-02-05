import {Injectable} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import {Photo} from '../../models/photo';
import {LabelsAdminka, LevelAdminka, MatterportLevel, RoomAdminka} from '../../models/Job';
import {JobsService} from '../jobs/jobs.service';
import {environment} from '../../../environments/environment';
import {MatterportApiService} from '../matterport-api/matterport-api.service';
import {CWindow} from '../../../declarations/CWindow';
import {Sweep} from '../../../declarations/sdk';
import {SizeComponentService} from '../size-component.service';
import {HeightService} from '../height.service';
declare let window: CWindow;


@Injectable({
  providedIn: 'root'
})
export class CanvasService {


  constructor(public jobsService: JobsService, public matterportApiService: MatterportApiService,
              public heightService: HeightService,
              public sizeComponentService: SizeComponentService) {
    this.getDefaultActiveCamIndex();

    this.interval = window.setInterval(this.draw.bind(this), 34);
  }

  get rotationMatDeg(): number
  {
    return  this.jobsService.job?.matterportRotation || 0;
  }

  emit(event: { name: string; value?: any}): void
  {
    this.subject$.next(event);
  }

  addCanvasShell(canvas: HTMLCanvasElement, full = false): CanvasShell | undefined {
    const dc = canvas.getContext('2d');
    let canvasShell;
    if (dc) {
      canvasShell = new CanvasShell(canvas, dc);
      canvasShell.full = full;
      this.canvasShell.push(canvasShell);
    }
    return canvasShell;
  }

  removeCanvasShell(i: CanvasShell) {
    const index = this.canvasShell.findIndex((item) => item.canvas === i.canvas);
    if (index > -1) {
      this.canvasShell.splice(index, 1);
    }
  }

  on(eventName: string, action: any): Subscription
  {
    return this.subject$.pipe(
      filter( (e: any) => e.name === eventName ),
      map( (e: CanvasEventData) => e.value)
    ).subscribe(action);
  }

  setActiveImg(activeImg: Photo): void
  {
    this.activeImg = activeImg;
  }

  getActiveImg(): Photo {
    return this.activeImg;
  }

  getCanvasFromEventX(e: MouseEvent | TouchEvent, item: CanvasShell): number {
    return e instanceof MouseEvent ?
      (e.offsetX || e.pageX - item.canvas.getBoundingClientRect().left)
      : e.touches[0].pageX - item.canvas.getBoundingClientRect().left;
  }

  getCanvasFromEventY(e: MouseEvent | TouchEvent, item: CanvasShell): number {
    return e instanceof MouseEvent ?
      (e.offsetY || e.pageY - item.canvas.getBoundingClientRect().top)
      : e.touches[0].pageY - item.canvas.getBoundingClientRect().top;
  }

  setActiveLevel(level: number): void
  {
    if (this.activeLevel !== level) {
      this.activeLevel = level;
      if (this.matterportMode) {
        this.matterportApiService.mpSdk?.Floor.moveTo(this.getActiveLevelMatterport(level))
      } else {
        this.getDefaultActiveCamIndex(level);
        this.viewAll();
      }
    }
  }

  setActiveLevelButton(level: number): void
  {
    // console.log('setActiveLevelButton');
    if (this.matterportMode) {
      this.matterportApiService.mpSdk?.Floor.moveTo(this.getActiveLevelMatterport(level));
    } else {
      this.activeLevel = level;
      this.getDefaultActiveCamIndex(level);
      this.viewAll();
    }
  }

  setActiveLevelButtonFloorplan(level: number): void
  {
    const oldLevel = this.activeLevel;
    // console.log(oldLevel !== level);
    if(oldLevel !== undefined && oldLevel !== level && this.timerIdAnimation === undefined) {
      this.canvasShell.forEach(item => {
        // this.viewAllAnimation(item, item.scale, item.mouseMoveShiftX + 100, item.mouseMoveShiftY + 100);
        this.viewAllAnimation(item, oldLevel, level);
      })
    }
    this.getDefaultActiveCamIndex(level);
    this.activeLevel = level;
  }

  getDefaultActiveCamIndex(level?: number): void
  {
    if (level === undefined) {
      if (this.jobsService.job?.get_photos_original?.[0]) {
        this.setActiveImg(this.jobsService.job?.get_photos_original?.[0]);
      }
    } else {
      // this.setActiveLevel(level);
      let p = this.defaultPhoto[level];
      // console.log(p);
      if (p === undefined) {
        const p_ar = this.jobsService.job?.get_photos_original?.filter((photo: Photo) => this.filterLevelPhoto(photo, level));
        p = p_ar && p_ar[0] ? p_ar[0] : undefined;
        // console.log(p);
        if(p === undefined) {
          this.defaultPhoto.some((photo: Photo|undefined, index: number) => {
            if(photo !== undefined && index !== level) {
              p = new Photo();
              Object.assign(p, photo);
              if (p && p.hotspot !== undefined && p.index !== undefined && this.jobsService.job?.get_photos_original) {
                p.hotspot.level_index = level;
                p.index = this.jobsService.job?.get_photos_original?.length;
              }
            }
            return photo !== undefined;
          })
        }
      }
      if(p) {
        this.defaultPhoto[level] = p;
        this.setActiveImg(p);
        // console.log(this.defaultPhoto, level , p, p.hotspot?.level_index);
        this.emit({name: 'changeActivePhotoInCanvas'});
      }
    }
  }

  private getDefaultLevel(): void
  {
    let level = 0;
    this.jobsService.job?.levels.some((levelAdminka: LevelAdminka) => {
      if (levelAdminka.default.toUpperCase() === 'YES') {
        level = levelAdminka.index;
        return true;
      }
      return false;
    });
    this.setActiveLevel(level);
  }


  init(): void {
    if (!this.initFlag) {
      this.initFlag = true;
      this.getDefaultLevel();
    }
  }


  getWorld(level: number): WorldWindow {
    return window.FloorWorld[(level)];
  }

  getShiftBetweenWorldLeft(level: number, self: boolean = false): number {
    return this.getLeftLevel((self ? level : this.getActiveLevel())) - this.getLeftLevel(level);
  }

  getShiftWorldLeft(level: number): number {
    return this.getWorld(level)?.left * this.getScaleWorldForLevel(level);
  }

  getFromCanvasX(x: number, item: CanvasShell): number {
    return x / item.scale;
  }

  getShiftBetweenWorldTop(level: number, self: boolean = false): number {
    return this.getTopLevel((self ? level : this.getActiveLevel())) - this.getTopLevel(level) - this.getHeightLevel(level);
  }

  getShiftWorldBottom(level: number): number {
    return this.getWorld(level)?.bottom * this.getScaleWorldForLevel(level);
  }

  getFromCanvasY(y: number, item: CanvasShell): number {
    return y / item.scale;
  }

  getFromEventX(e: MouseEvent | TouchEvent, item: CanvasShell): number {
    return this.getFromCanvasX(this.getCanvasFromEventX(e, item), item);
  }

  getFromEventY(e: MouseEvent | TouchEvent, item: CanvasShell): number {
    return this.getFromCanvasY(this.getCanvasFromEventY(e, item), item);
  }

  setEvent(e: MouseEvent | TouchEvent): void {
    this.e = e;
  }

  getEvent(): MouseEvent | TouchEvent | undefined {
    return this.e;
  }

  mouseXWorld(level: number, item: CanvasShell, forActiveLevel = false): number {
    return (this.mouseXHpl(item, level, forActiveLevel) + this.getShiftBetweenWorldLeft(level) + this.getShiftWorldLeft(level)) / this.getScaleWorldForLevel(level);
  }

  mouseYWorld(level: number, item: CanvasShell, forActiveLevel = false): number {
    return (-this.mouseYHpl(item, level, forActiveLevel) - this.getShiftBetweenWorldTop(level) + this.getShiftWorldBottom(level)) / this.getScaleWorldForLevel(level);
  }

  mouseX(item: CanvasShell): number {
    const e = this.getEvent();
    return e ? this.getFromEventX(e, item) : 0;
  }

  mouseXHpl(item: CanvasShell, level?: number, forActiveLevel = false): number {
    return this.mouseX(item) - item.mouseMoveShiftX - (level !== undefined && !forActiveLevel ? this.getShiftBetweenHplLeft(level) : 0);
  }


  mouseYHpl(item: CanvasShell, level?: number, forActiveLevel = false): number {
    return this.mouseY(item) - item.mouseMoveShiftY + (level !== undefined && !forActiveLevel ? this.getShiftBetweenHplTop(level) : 0);
  }

  mouseXMat(level: number, item: CanvasShell): number {
    return this.convertHplXToMap(this.mouseXHpl(item, level), this.mouseYHpl(item, level), level);
  }

  mouseY(item: CanvasShell): number {
    const e = this.getEvent();
    return e ? this.getFromEventY(e, item) : 0;
  }

  mouseYMat(level: number, item: CanvasShell): number {
    return this.convertHplYToMap(this.mouseXHpl(item, level), this.mouseYHpl(item, level), level);
  }

  convertWxToHpl(wx: number, level: number, self: boolean = false): number {
    return wx * this.getScaleWorldForLevel(level) - this.getShiftBetweenWorldLeft(level, self) - this.getShiftWorldLeft(level);
  }

  convertWyToHpl(wy: number, level: number, self: boolean = false): number {
    return - wy * this.getScaleWorldForLevel(level) - this.getShiftBetweenWorldTop(level, self) + this.getShiftWorldBottom(level);
  }

  convertHplToWX(hx: number, level: number): number {
    return (hx + this.getShiftWorldLeft(level) + this.getShiftBetweenWorldLeft(level)) / this.getScaleWorldForLevel(level);
  }

  convertHplToWY(hy: number, level: number): number {
    return - (hy - this.getShiftWorldBottom(level) + this.getShiftBetweenWorldTop(level)) / this.getScaleWorldForLevel(level);
  }


  convertHplXToMap(hx: number, hy: number, level: number): number {
    if (this.rotationMatDeg === 90) {
      // console.log('width ' + this.getWidthMatterport(level)/ this.getFootKLevel(level), 'heigth ' + this.getHeightMatterport(level)/ this.getFootKLevel(level));

      return (-hy - this.getShiftXMatterportWellInFoot(level) - this.getMinYMatterportLevelInFoot(level)) / this.getFootKLevel(level);
    } else if (this.rotationMatDeg === 270) {
      return (this.getWidthLevel(level) - (hy + this.getShiftXMatterportWellInFoot(level) - this.getMinXMatterportLevelInFoot(level)))
        / this.getFootKLevel(level);
    } else if (this.rotationMatDeg === 180) {
      return (this.getWidthLevel(level) - (hx + this.getShiftXMatterportWellInFoot(level) - this.getMinXMatterportLevelInFoot(level)))
        / this.getFootKLevel(level);
    } else {
      return (hx - this.getShiftXMatterportWellInFoot(level) + this.getMinXMatterportLevelInFoot(level)) / this.getFootKLevel(level);
    }
  }

  convertHplYToMap(hx: number, hy: number, level: number): number {
    if (this.rotationMatDeg === 90) {
      return (hx - this.getShiftYMatterportWellInFoot(level) + this.getMinYMatterportLevelInFoot(level)) / this.getFootKLevel(level);
    } else if (this.rotationMatDeg === 270) {
      return (this.getHeightMatterport(level)
        - (hx - this.getShiftYMatterportWellInFoot(level) - this.getMinYMatterportLevelInFoot(level)))
        / this.getFootKLevel(level);
    } else if (this.rotationMatDeg === 180) {
      return (this.getHeightMatterport(level)
        - (hy - this.getShiftYMatterportWellInFoot(level) - this.getMinYMatterportLevelInFoot(level)))
        / this.getFootKLevel(level);
    } else {
      return (hy - this.getShiftYMatterportWellInFoot(level) + this.getMinYMatterportLevelInFoot(level)) / this.getFootKLevel(level);
    }

  }

  convertMapXToHpl(mx: number, level: number): number {
    return mx * this.getFootKLevel(level) + this.getShiftXMatterportWellInFoot(level) - this.getMinXMatterportLevelInFoot(level);
  }

  convertMapYToHpl(my: number, level: number): number {
    return my * this.getFootKLevel(level) + this.getShiftYMatterportWellInFoot(level) - this.getMinYMatterportLevelInFoot(level);
  }

  convertMapXToWorld(mx: number, level: number): number {
    return this.convertHplToWX(this.convertMapXToHpl(mx, level), level);
  }

  convertMapYToWorld(my: number, level: number): number {
    return this.convertHplToWY(this.convertMapYToHpl(my, level), level);
  }

  levelA(level?: number | undefined) {
    level = level === undefined ? this.getActiveLevel() : level;
    return this.jobsService.job?.levels.find((levelAdminka: LevelAdminka) => levelAdminka.index === level) || this.jobsService.job?.levels[level];
  }

  insideSweep(rooms: RoomAdminka[], level: number): Sweep.ObservableSweepData[] {
    return this.matterportApiService.getArraySweepData().filter((sweep: Sweep.ObservableSweepData) => {
      if (sweep.position && this.syncLevelCanvasAndMatterport(sweep, level)) {
        const point = [sweep.position.x, sweep.position.z];
        if (rooms.length > 0) {
          return this.inside(point, rooms[0].polygonMat);
        } else if (this.jobsService.job){
          const levelA = this.levelA(level)

          if (levelA.polygon) {
            return this.inside(point, levelA.polygon, true);
          }
        }
      }
      return false;
    });
  }

  identifyRoom(wx: number, wy: number, level: number): RoomAdminka[] {
    this.initialPolygonMat();
    return this.jobsService.job?.rooms.filter((room: RoomAdminka) => {
      return this.inside([wx, wy], room.polygon) && room.index_level === level;
    }) || [];
  }

  initialPolygonMatMap(l: RoomAdminka | LevelAdminka): void
  {
    const level = 'index_level' in l  ? l.index_level : l.index;
    l.polygonMat = [];
    l.polygon?.map((item: [number, number]) => {
      l.polygonMat.push([
        this.convertHplXToMap(this.convertWxToHpl(item[0],  level, true), this.convertWyToHpl(item[1],  level, true),  level),
        this.convertHplYToMap(this.convertWxToHpl(item[0],  level, true), this.convertWyToHpl(item[1],  level, true),  level)
      ]);
    });
  }

  initialPolygonMat(): void {
    if (!this.jobsService.job?.rooms[0].polygonMat || this.jobsService.job?.rooms[0].polygonMat.length === 0 || this.jobsService.edit) {
      this.jobsService.job?.rooms.map(this.initialPolygonMatMap.bind(this));
      this.jobsService.job?.levels.map(this.initialPolygonMatMap.bind(this));
    }
  }

  onMouseMove(e: MouseEvent | TouchEvent, item: CanvasShell): void {

    if (this.mouseDown) {
      if (this.measureMode && this.currentMeasure) {
        this.setEvent(e);
        this.currentMeasure.update(this.mouseXHpl(item) + this.getLeftLevel(this.getActiveLevel()),
          this.mouseYHpl(item) + this.getTopLevel(this.getActiveLevel()), this.getScaleWorldForLevel(this.getActiveLevel()));
      } else {
        this.moveFloor(e, item);
      }
    } else {
      this.setEvent(e);
      let inObject;
      if (!this.matterportMode && !this.measureMode ) {
        inObject = this.findPhotoIndexForMousePosition(item);
      } else if(this.matterportMode) {
        inObject = this.nearestMatterportForMousePosition(item, 1);
      }
      item.canvas.style.cursor = inObject === undefined ? 'default' : 'pointer';
    }
  }



  public get popupX(): number {
    return this.popupXCamera - this.vector[0];
    // return this.mouseX() * this.scale;
  }

  public get popupY(): number  {
    return this.popupYCamera - this.vector[1];
    // return this.mouseY() * this.scale;
  }

  onMouseWheel(e: WheelEvent, item: CanvasShell): void {
    this.zoomOnPoint(this.getCanvasFromEventX(e, item), this.getCanvasFromEventY(e, item),
      (e.deltaY > 0 ? -this.ZoomIncrement : this.ZoomIncrement), item);
  }

  onMouseShiftWheel(e: WheelEvent, item: CanvasShell): void {
    item.mouseMoveShiftY += e.deltaY / (item.scale + 1);
  }

  onMouseCtrlWheel(e: WheelEvent, item: CanvasShell): void {
    item.mouseMoveShiftX += e.deltaY / (item.scale + 1);
  }

  plus(item: CanvasShell): void {
    this.zoomOnPoint(item.canvas.getBoundingClientRect().width * 0.5, item.canvas.getBoundingClientRect().height * 0.5, this.ZoomIncrement, item);
  }

  minus(item: CanvasShell): void {
    this.zoomOnPoint(item.canvas.getBoundingClientRect().width * 0.5, item.canvas.getBoundingClientRect().height * 0.5, -this.ZoomIncrement, item);
  }

  onMousePinch(e: any, item: CanvasShell): boolean {

    // console.log(e.center.x - item.canvas.getBoundingClientRect().left, e.center.y - item.canvas.getBoundingClientRect().top);

    this.pinchOnPoint(e.center.x - item.canvas.getBoundingClientRect().left,
      e.center.y - item.canvas.getBoundingClientRect().top, e.scale, item);
    return false;
  }


  pinchOnPoint(canvasX: number, canvasY: number, scale: number, item: CanvasShell): void {
    if (this.enableZoomOnPoint) {
      // const oldScale = item.scale;
      item.scale = item.pinchScale * scale;
      // item.mouseMoveShiftX = -canvasX/oldScale + item.pinshMoveShiftX * item.pinchScale;
      // item.mouseMoveShiftY = -canvasY/oldScale + item.pinshMoveShiftY * item.pinchScale;

      item.mouseMoveShiftX = item.pinshMoveShiftX * item.pinchScale;
      item.mouseMoveShiftY = item.pinshMoveShiftY * item.pinchScale;
    }
    console.log(item);
  }

  zoomOnPoint(canvasX: number, canvasY: number, scaleIncrement: number, item: CanvasShell): void {
    if (this.enableZoomOnPoint) {
      item.scale *= (1 + scaleIncrement);
      item.mouseMoveShiftX -= canvasX / item.scale * scaleIncrement;
      item.mouseMoveShiftY -= canvasY / item.scale * scaleIncrement;
    }
  }

  getMinXMatterportLevelInFoot(level: number): number {
    return (this.matterportApiService.minX[this.getActiveLevelMatterport(level)]
      + (this.jobsService.job?.matterport_levels[this.getActiveLevelMatterport(level)]?.offset_x || 0)) * this.getFootKLevel(level);
  }

  getMinYMatterportLevelInFoot(level: number): number {
    return (this.matterportApiService.minY[(this.getActiveLevelMatterport(level))]
      + (this.jobsService.job?.matterport_levels[this.getActiveLevelMatterport(level)]?.offset_y || 0)) * this.getFootKLevel(level);
  }

  getFootKLevel(level: number): number {
    if (!this.footKLevel[level]) {
      this.footKLevel[level] = [39.37008 * this.getScaleWorldForLevel(level)];
    }
    return this.footKLevel[level][0];
  }

  getShiftXMatterportLevelInFoot(level: number): number {
    return (this.getWidthLevel(level) - this.getWidthMatterport(level)) * 0.5;
  }

  getShiftXMatterportWellInFoot(level: number): number {
    if (this.rotationMatDeg === 90 || this.rotationMatDeg === 270) {
      const shift = (this.getHeightWell(level) - this.getWidthMatterport(level)) * 0.5;
      return - (this.jobsService.wallsMaxY[level] -
        (this.getWorld(level).bottom + this.getWorld(level).height)) * this.getScaleWorldForLevel(level) + shift;

      // const shift = (this.getWidthWell(level) - this.getHeightMatterport(level)) * 0.5;
      // return (this.jobsService.wallsMinX[level] - this.getWorld(level).left) * this.getScaleWorldForLevel(level) + shift;
    } else {
      const shift = (this.getWidthWell(level) - this.getWidthMatterport(level)) * 0.5;
      return (this.jobsService.wallsMinX[level] - this.getWorld(level).left) * this.getScaleWorldForLevel(level) + shift;
    }

  }

  getShiftYMatterportLevelInFoot(level: number): number {
    return (this.getHeightLevel(level) - this.getHeightMatterport(level)) * 0.5;
  }

  getShiftYMatterportWellInFoot(level: number): number {
    if (this.rotationMatDeg === 90 || this.rotationMatDeg === 270) {
      const shift = (this.getHeightWell(level) - this.getWidthMatterport(level)) * 0.5;
      return - (this.jobsService.wallsMaxY[level] -
        (this.getWorld(level).bottom + this.getWorld(level).height)) * this.getScaleWorldForLevel(level) + shift;
    } else {
      const shift = (this.getHeightWell(level) - this.getHeightMatterport(level)) * 0.5;
      return - (this.jobsService.wallsMaxY[level] -
        (this.getWorld(level).bottom + this.getWorld(level).height)) * this.getScaleWorldForLevel(level) + shift;
    }
  }

  getHeightMatterport(level: number): number {
    return this.matterportApiService.getHeight((this.getActiveLevelMatterport(level))) * this.getFootKLevel(level);
  }

  getWidthMatterport(level: number): number {
    return this.matterportApiService.getWidth((this.getActiveLevelMatterport(level))) * this.getFootKLevel(level);
  }


  onResizeCanvas(): void {
    if (this.timeoutIdResizeCanvas) {
      clearTimeout(this.timeoutIdResizeCanvas);
    }
    this.timeoutIdResizeCanvas = window.setTimeout(() => {
      requestAnimationFrame(() => {
        this.canvasShell.forEach((item: CanvasShell) => {
          if (!item.full) {
            item.canvas.width = 0;
            item.canvas.height = 0;
            item.canvas.style.width = '0';
            item.canvas.style.height = '0';
          }
          setTimeout(() => {
            if (item.canvas.parentElement && !item.full) {
              // console.log(canvas.getBoundingClientRect(), canvas.parentElement?.getBoundingClientRect(),
              item.canvas.width = Math.floor(item.canvas.parentElement.getBoundingClientRect().width - 5);
              item.canvas.height = Math.floor(item.canvas.parentElement.getBoundingClientRect().height - 5);
              item.canvas.style.width = item.canvas.width + 'px';
              item.canvas.style.height = item.canvas.height + 'px';
            }else {
              item.canvas.height = this.heightService.heightCanvas;
              item.canvas.width = this.heightService.width;
              item.canvas.style.height = this.heightService.height;
            }
          }, 0);
        })
        setTimeout(() => {
          this.viewAll();
        }, 1)
      });
    }, 100);
  }


  onMouseDown(event: MouseEvent | TouchEvent, item: CanvasShell): void {
    event.preventDefault();
    this.setEvent(event);

    if (this.measureMode) {
      this.currentMeasure = new Measurement(this.getActiveLevel(),
        this.mouseXHpl(item) + this.getLeftLevel(this.getActiveLevel()),
        this.mouseYHpl(item) + this.getTopLevel(this.getActiveLevel()));
      this.measurements.push(this.currentMeasure);
    }

    this.mouseDown = true;
    this.oldEvent = event;
  }


  onMouseUp(item: CanvasShell): Photo | undefined {
    let p = undefined;
    if (!this.measureMode && !this.matterportMode) {
      p = this.sizeComponentService.showAllHotspots ? this.isSelectObjectInFloor(item) : this.isNearestObjectInFloor(item);
    } else if (this.matterportMode && !this.mouseMove && !this.measureMode) {
      this.matterportApiService.sweepMoveBySweep(this.nearestMatterportForMousePosition(item));
    }

    if (this.measureMode) {
      this.currentMeasure = undefined;
    }

    this.mouseDown = false;
    this.mouseMove = false;

    if (p) {
      const levelIndex = this.nearestLevel(item);
      this.popupXCamera = this.mouseX(item) * item.scale;
      this.popupYCamera = this.mouseY(item) * item.scale;
      this.popupXWorld = this.mouseXWorld(levelIndex, item);
      this.popupYWorld = this.mouseYWorld(levelIndex, item);
      this.vector = [ -((p.hotspot?.wx || 0) - this.popupXWorld) * item.scale, ((p.hotspot?.wy || 0) -  this.popupYWorld)  * item.scale ];
    }
    this.popupShow = !!p;
    return p;
  }

  onLeave(): void {
    this.mouseDown = false;
    this.mouseMove = false;
    if (this.measureMode) {
      this.currentMeasure = undefined;
    }
  }

  moveFloor(e: MouseEvent | TouchEvent, item: CanvasShell): void {
    if (this.mouseDown) {
      let deltaX = 0, deltaY = 0;
      if (e instanceof MouseEvent && this.oldEvent instanceof MouseEvent) {
        deltaX = e.clientX - this.oldEvent.clientX;
        deltaY = e.clientY - this.oldEvent.clientY;
      } else if (e instanceof TouchEvent && this.oldEvent instanceof TouchEvent) {
        deltaX = e.touches[0].clientX - this.oldEvent.touches[0].clientX;
        deltaY = e.touches[0].clientY - this.oldEvent.touches[0].clientY;
      }
      const d = 4;
      if (!this.mouseMove && Math.abs(deltaX) < d && Math.abs(deltaY) < d) {
        return
      }
      item.mouseMoveShiftX += deltaX / item.scale;
      item.mouseMoveShiftY += deltaY / item.scale;

      this.oldEvent = e;
      this.mouseMove = true;
    }
  }

  filterLevelPhoto(photo: Photo, level: number): boolean {
    return level === photo.hotspot?.level_index;
  }

  filterLevelLabel(label: LabelsAdminka, level: number): boolean {
    return level === label.level_number;
  }

  getActiveLevelMatterport(level: number): number {
    const m = this.jobsService.job?.matterport_levels.find((matterportLevel: MatterportLevel) => matterportLevel.index_level === level);
    return m ? m.index : 0;
  }

  setActiveLevelMatterport(level: number): void {
    const m = this.jobsService.job?.matterport_levels.find((matterportLevel: MatterportLevel) => matterportLevel.index === level);

    if (m && m.index_level !== undefined) {
      this.setActiveLevel(typeof m.index_level === 'string' ? parseInt(m.index_level, 10) : m.index_level);
    }
  }

  syncLevelCanvasAndMatterport(sweep: Sweep.ObservableSweepData, level: number): boolean {
    return this.getActiveLevelMatterport(level) === sweep.floorInfo.sequence;
  }


  convertMatXToHpl(sweep: Sweep.ObservableSweepData, level: number): number {
    return (this.getShiftXMatterportWellInFoot(level) - this.getMinXMatterportLevelInFoot(level))
      + (sweep.position?.x || 0) * this.getFootKLevel(level);
  }

  convertMatYToHpl(sweep: Sweep.ObservableSweepData, level: number): number {
    return (this.getShiftYMatterportWellInFoot(level) - this.getMinYMatterportLevelInFoot(level))
      + (sweep.position?.z || 0) * this.getFootKLevel(level);
  }

  // findMatterportForMousePosition(item: CanvasShell): Sweep.ObservableSweepData | undefined {
  //   const level = this.nearestLevel(item);
  //   const mouseXHpl = this.mouseXHpl(item);
  //   const mouseYHpl = this.mouseYHpl(item);
  //
  //   return this.matterportApiService.getArraySweepData().find((sweep: Sweep.ObservableSweepData) => {
  //     if (this.syncLevelCanvasAndMatterport(sweep, level)) {
  //       return Math.abs(mouseXHpl - this.convertMatXToHpl(sweep, level)) < this.clickToler / 4 &&
  //         Math.abs(mouseYHpl - this.convertMatYToHpl(sweep, level)) < this.clickToler / 4;
  //     } else {
  //       return false;
  //     }
  //   });
  // }

  getShiftBetweenHplLeft(level: number): number {
    return this.getLeftLevel() - this.getLeftLevel(level);
  }

  getShiftBetweenHplTop(level: number): number {
    return this.getTopLevel() - this.getTopLevel(level);
  }

  nearestMatterportForMousePosition(item: CanvasShell, minDistance: number|undefined = undefined): Sweep.ObservableSweepData | undefined {
    const level = this.nearestLevel(item);
    const wx = this.mouseXWorld(level, item);
    const wy = this.mouseYWorld(level, item);
    const rooms = this.identifyRoom(wx, wy, level);
    const matterportSweeps = this.insideSweep(rooms, level);
    const mouseXMat = this.mouseXMat(level, item);
    const mouseYMat = this.mouseYMat(level, item);
    let distance = 1000000;
    let s;
    // console.log(rooms);

    matterportSweeps.forEach((sweep: Sweep.ObservableSweepData) => {
      const d = Math.sqrt((mouseXMat - (sweep.position?.x || 0)) ** 2 + ( mouseYMat - (sweep.position?.z || 0)) ** 2);
      if (d < distance && (minDistance === undefined || d < minDistance)) {
        distance = d;
        s = sweep;
        // console.clear();
        // console.log(sweep.position);
      }
    });
    // console.log(distance);
    return s;
  }

  findPhotoIndexForMousePosition(item: CanvasShell): Photo | undefined {

    const levelIndex = this.nearestLevel(item);
    const wx = this.mouseXWorld(levelIndex, item, true);
    const wy = this.mouseYWorld(levelIndex, item, true);

    return this.jobsService.job?.get_photos_original?.find((photo: Photo) => {
      if (levelIndex === photo.hotspot?.level_index && photo.deleted === 0) {
        return Math.abs(wx - (photo.hotspot?.wx || 0)) < this.clickToler &&
          Math.abs(wy - (photo.hotspot?.wy || 0)) < this.clickToler;
      }
      return false;
    });
  }

  isSelectObjectInFloor(item: CanvasShell): Photo | undefined {
    const p = this.findPhotoIndexForMousePosition(item);
    if (p) {
      this.setActiveCamera( p );
      this.emit({name: 'changeActivePhotoInCanvas'});
    }
    return p;
  }

  distance(p1: Photo, mouseXWorld: number, mouseYWorld: number): number {
    return Math.sqrt((mouseXWorld - (p1.hotspot?.wx || 0)) ** 2 + ( mouseYWorld - (p1.hotspot?.wy || 0)) ** 2);
  }


  nearestLevel(item: CanvasShell): number
  {
    let levelIndex = this.getActiveLevel();
    this.inActiveLevel = false;
    if ((this.jobsService.job?.levels.length || 0) >= 1) {
      const mouseXUnit = this.mouseXHpl(item) + this.getLeftLevel();
      const mouseYUnit = this.mouseYHpl(item) + this.getTopLevel();
      const index = this.jobsService.job?.levels.find((level: LevelAdminka) =>
          mouseXUnit > this.getLeftLevel(level.index) && mouseXUnit < this.getRightLevel(level.index)
          && mouseYUnit > this.getTopLevel(level.index) && mouseYUnit < this.getBottomLevel(level.index)
      )?.index;
      levelIndex = index === undefined ? levelIndex : index;
      if (index === this.getActiveLevel()) {
        this.inActiveLevel = true;
      }
    }
    return levelIndex;
  }

  isNearestObjectInFloor(item: CanvasShell): Photo | undefined {
    let p = this.getActiveImg();
    let p_old = p;
    let distance = 1000000;
    const levelIndex = this.nearestLevel(item);

    const mouseXWorld = this.mouseXWorld(levelIndex, item);
    const mouseYWorld = this.mouseYWorld(levelIndex, item);
    this.jobsService.job?.levels.forEach((level: LevelAdminka) => {
      if (level.index === levelIndex) {
        this.jobsService.job?.get_photos_original?.filter((photo: Photo) => this.filterLevelPhoto(photo, level.index))
          .forEach((photo: Photo) => {
            if (photo.hotspot && photo.deleted === 0) {
              const d = this.distance(photo, mouseXWorld, mouseYWorld);
              if (d < distance) {
                distance = d;
                p = photo;
              }
            }
          });
      }
    });

    if ((p_old === undefined && p !== undefined) || (p_old !== p && distance < 70)) {
      this.setActiveCamera(p);
      this.emit({name: 'changeActivePhotoInCanvas'});
    }
    return p;
  }

  setActiveCamera(photo: Photo): void {
    this.setActiveImg(photo);
    if (photo.hotspot) {
      this.defaultPhoto[photo.hotspot.level_index] = photo;

      if (photo.hotspot.level_index !== this.getActiveLevel())  {
        this.setActiveLevel(photo.hotspot.level_index || 0);
        // this.viewAllAnimation(item, this.getActiveLevel() , photo.hotspot.level_index)
      }
    }
  }

  toggleMeasure(): void {
    this.measureMode = !this.measureMode;
    if (this.measureMode) {
      this.measurements = [];
      this.currentMeasure = undefined;
    }
  }

  private draw(): void {
    if (this.jobsService.showCanvas) {
      if (this.idDraw) {
        cancelAnimationFrame(this.idDraw);
      }
      this.idDraw = requestAnimationFrame(this.stepDraw.bind(this));
    }
  }

  drawPositionMouse(dc: CanvasRenderingContext2D, item: CanvasShell) {
    const e = this.getEvent();
    if (e) {
      dc.save();
      dc.setTransform(1, 0, 0, 1, 0, 0);
      dc.beginPath();
      dc.arc(this.getCanvasFromEventX(e, item), this.getCanvasFromEventY(e, item), 8, 0, 2 * Math.PI);
      dc.fillStyle = "rgba(150,150,150,0.2)";
      dc.strokeStyle = '#fff';
      dc.fill();
      dc.stroke();
      dc.restore();
    }
  }

  stepDraw(): void {
    this.canvasShell.forEach((item: CanvasShell) => {
      const canvas = item.canvas;
      const dc = item.dc;
      if (this.fitAllFlag) {
        this.setFitAll(item);
      }

      if (this.fitAllLevelsFlag) {
        this.setFitAllLevels(item);
      }

      this.clearCanvas(dc, canvas);
      for (const level of (this.jobsService.job?.levels || [])) {

        if (this.showAllLevels || level.index === this.getActiveLevel()) {

          this.setStartPositionCanvas(dc, item);
          if (this.debug) {
            if (level.index === this.getActiveLevel()) { this.drawBoard(dc, item); }
            this.drawDot(level.index, dc);
          }

          dc.save();
          dc.transform(1, 0, 0, -1,
            this.getLeftLevel(level.index) + item.mouseMoveShiftX,
            this.getTopLevel(level.index) + item.mouseMoveShiftY + this.getHeightLevel(level.index));
          if (this.debug) {
            this.drawRectangle(level.index, dc);
          }
          dc.save();
          this.worldTransform(level, dc);
          this.drawFloor(level.index, dc, item);
          this.drawNameLevel(level, dc, item);
          this.drawLabels(level, dc, item);
          if (!this.matterportMode && !this.measureMode) {
            this.drawHotspots(level.index, dc, item);
          }
          if (this.debug) {
            this.drawRoom(level.index, dc,true, false);
            this.drawWell(level.index, dc);
          }
          dc.restore();

          if (this.matterportMode) {
            this.drawMatterport(level.index, dc, item);
          }

          dc.restore();

          if (this.measureMode) {
            this.drawMeasurements(level.index, dc, item);
          }

        }


      }

      if (this.sizeComponentService.showAllHotspots) {
        this.drawPositionMouse(dc, item);
      }
    })
    this.fitAllFlag = false;
    this.fitAllLevelsFlag = false;
    this.idDraw = undefined;
  }

  drawWell(level: number, dc: CanvasRenderingContext2D): void {
    dc.save();
    dc.beginPath();
    this.jobsService.job?.levels.forEach((levelAdminka) => {
      if (levelAdminka.index === level) {
        levelAdminka.polygon?.forEach(
          (p, i) => {
            i === 0 ? dc.moveTo(p[0], p[1]) : dc.lineTo(p[0], p[1]);
          }
        );
      }
    });
    dc.closePath();

    dc.lineWidth = 7;
    dc.strokeStyle = '#0f0';
    dc.fillStyle = '#0f0';
    dc.stroke();

    dc.restore();
  }

  drawWellM(level: number, dc: CanvasRenderingContext2D): void {
    dc.save();
    dc.beginPath();
    const l = this.getActiveLevelMatterport(level);
    dc.moveTo(this.matterportApiService.minX[l] + (this.jobsService.job?.matterport_levels[l]?.offset_x || 0),
      this.matterportApiService.minY[l] + (this.jobsService.job?.matterport_levels[l]?.offset_y || 0));
    dc.lineTo(this.matterportApiService.maxX[l] + (this.jobsService.job?.matterport_levels[l]?.offset_x || 0),
      this.matterportApiService.minY[l] + (this.jobsService.job?.matterport_levels[l]?.offset_y || 0));
    dc.lineTo(this.matterportApiService.maxX[l] + (this.jobsService.job?.matterport_levels[l]?.offset_x || 0),
      this.matterportApiService.maxY[l] + (this.jobsService.job?.matterport_levels[l]?.offset_y || 0));
    dc.lineTo(this.matterportApiService.minX[l] + (this.jobsService.job?.matterport_levels[l]?.offset_x || 0),
      this.matterportApiService.maxY[l] + (this.jobsService.job?.matterport_levels[l]?.offset_y || 0));
    dc.closePath();
    dc.lineWidth = 0.2;
    dc.strokeStyle = '#0ff';
    dc.fillStyle = '#0ff';
    dc.stroke();
    dc.restore();
  }


  drawWellM2(level: number, dc: CanvasRenderingContext2D): void {
    dc.save();
    dc.beginPath();
    this.jobsService.job?.levels.forEach((levelAdminka) => {
      if (levelAdminka.index === level) {
        levelAdminka.polygonMat?.forEach(
          (p, index) => index === 0 ? dc.moveTo(p[0], p[1]) : dc.lineTo(p[0], p[1])
        );
      }
    });
    dc.closePath();

    dc.lineWidth = 0.7;
    dc.strokeStyle = '#ff2';
    dc.fillStyle = '#ff2';
    dc.stroke();

    dc.restore();
  }

  drawRoomM(level: number, dc: CanvasRenderingContext2D): void {
    this.jobsService.job?.rooms.map((room: RoomAdminka) => {
      if (room.index_level === level) {
        dc.save();
        dc.beginPath();

        room.polygonMat?.forEach((ar: [number, number], index) => {
          index === 0 ? dc.moveTo(ar[0], ar[1]) : dc.lineTo(ar[0], ar[1]);
        });

        dc.closePath();
        dc.lineWidth = 0.2;
        dc.strokeStyle = this.getRandomColor();
        dc.stroke();
        dc.restore();
      }
    });
  }

  drawRoom(level: number, dc: CanvasRenderingContext2D, stroke: boolean, fill: boolean): void {
    this.jobsService.job?.rooms.map((room: RoomAdminka) => {
      if (room.index_level === level) {
        dc.save();
        dc.beginPath();

        room.polygon.forEach((ar: [number, number], index) => {
          index === 0 ? dc.moveTo(ar[0], ar[1]) : dc.lineTo(ar[0], ar[1]);
        });

        dc.closePath();
        dc.lineWidth = 2;
        dc.fillStyle = this.getRandomColor();
        dc.strokeStyle = this.getRandomColor();
        if (fill) {
          dc.fill();
        }
        if (stroke) {
          dc.stroke();
        }

        dc.restore();
      }
    });
  }


  inside(point: number[], vs: [number, number][], outside = false): boolean {
    // ray-casting algorithm based on
    // https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html/pnpoly.html
    const x = point[0]; const y = point[1];
    let inside = outside;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0]; const yi = vs[i][1]; const xj = vs[j][0]; const yj = vs[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) { inside = !inside; }
    }
    return inside;
  }

  getRandomColor(): string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  get rotationMatRad(): number
  {
    return this.rotationMatDeg * (Math.PI / 180);
  }

  drawMatterport(level: number, dc: CanvasRenderingContext2D, item: CanvasShell): void {
    const footK = this.getFootKLevel(level);
    const dw = 16 / (footK * item.scale) ;
    const dh = 16 / (footK * item.scale) ;

    const minX = this.getMinXMatterportLevelInFoot(level);
    const minY = this.getMinYMatterportLevelInFoot(level);

    const shiftX = this.getShiftXMatterportWellInFoot(level);
    const shiftY = this.getShiftYMatterportWellInFoot(level);


    dc.save();
    let e;
    let f;
    if (this.rotationMatDeg === 90) {
      e = -minX + shiftY;
      f = minY - shiftX;
    } else if (this.rotationMatDeg === 270) {
      e = -minX + shiftY - this.getHeightLevel(level);
      f = minY + shiftX + this.getWidthLevel(level);
    } else if (this.rotationMatDeg === 180) {
      e = -this.getWidthMatterport(level) - shiftX - minX;
      f = minY + shiftY - this.getHeightLevel(level) + this.getHeightMatterport(level);
    } else {
      e = shiftX - minX;
      f = minY - shiftY + this.getHeightLevel(level);
    }

    dc.rotate(this.rotationMatRad);
    dc.transform(footK, 0, 0, -footK, e, f );
    const percent = (new Date()).getMilliseconds()/1000;
    this.matterportApiService.getArraySweepData().map((sweep: Sweep.ObservableSweepData) => {
      this.drawOneMatterport(sweep, dc, level, dw, dh, percent);
    });
    if (this.debug) {
      // this.drawWellM(level);
      // this.drawWellM2(level);
      // this.drawRoomM(level);
    }
    dc.restore();
  }

  drawOneMatterport(sweep: Sweep.ObservableSweepData, dc: CanvasRenderingContext2D, level: number, dw: number, dh: number, percent: number): void {
    if (sweep.position && this.syncLevelCanvasAndMatterport(sweep, level)) {
      dc.save();
      if (sweep.id === this.matterportApiService.pose?.sweep) {
        const p = this.matterportApiService.pose.position;
        this.drawOnePin(dc, p.x, p.z, - p.y * 0.01745, dw, dh);
      } else {
        this.drawOneArc(dc, sweep.position.x, sweep.position.z, false, 0.5 * percent, false,0.5 - percent*0.5);
      }

      if (this.debug) {
        dc.font = "0.5px serif";
        dc.fillText(sweep.position.x.toFixed(2) + ' || ' + sweep.position.z.toFixed(2), sweep.position.x, sweep.position.z)
      }

      dc.restore();
    }
  }

  drawMeasurements(level: number, dc: CanvasRenderingContext2D, item: CanvasShell): void {
    dc.save();
    // dc.setTransform(InitialScale, 0, 0, InitialScale, InitialShiftX, InitialShiftY);
    dc.beginPath();
    dc.lineWidth = 0.5;
    dc.strokeStyle = '#ff0000';
    dc.fillStyle = '#ff0000';
    for (const measurement of this.measurements) {
      if (measurement.level === level) {
        this.drawOneMeasurement(measurement, dc, item);
      }
    }

    dc.restore();
  }

  drawOneMeasurement(measurement: Measurement, dc: CanvasRenderingContext2D, item: CanvasShell): void {
    if (measurement.value){
      const x1 = (measurement.startX || 0) + item.mouseMoveShiftX;
      const x2 = (measurement.endX || 0) + item.mouseMoveShiftX;
      const y1 = (measurement.startY || 0) + item.mouseMoveShiftY;
      const y2 = (measurement.endY || 0) + item.mouseMoveShiftY;
      dc.moveTo(x1, y1);
      dc.lineTo(x2, y2);
      dc.arc(x1, y1, 0.5, 0, 2 * Math.PI, false);
      dc.arc(x2, y2, 0.5, 0, 2 * Math.PI, false);
      dc.stroke();
      dc.fillText(measurement.value, (x1 + x2) * 0.5, (y1 + y2) * 0.5);
    }
  }

  worldTransform(level: LevelAdminka, dc: CanvasRenderingContext2D): void {
    const scaleWorld = this.getScaleWorldForLevel(level.index);
    dc.transform(scaleWorld, 0, 0, scaleWorld, -this.getShiftWorldLeft(level.index), -this.getShiftWorldBottom(level.index));
  }

  getScaleWorldForLevel(level: number): number {
    // return 1;
    if (!this.scaleWorld[level]) {
      this.scaleWorld[level] = [this.getWidthLevel(level) / this.getWorld(level)?.width];
    }
    // console.log(this.scaleWorld);
    return this.scaleWorld[level][0];
  }

  drawDot(level: number, dc: CanvasRenderingContext2D): void
  {
    dc.save();
    dc.fillRect(this.getLeftLevel(level), this.getTopLevel(level), 100, 100);
    dc.restore();
  }

  drawBoard(dc: CanvasRenderingContext2D, item: CanvasShell): void
  {
    dc.save();

    for (let x = this.getLeftLevel(this.activeLevel);
         x <= item.canvas.width / item.scale + this.getLeftLevel(this.activeLevel); x += 100) {
      dc.moveTo(x, this.getTopLevel(this.activeLevel));
      dc.lineTo(x, item.canvas.height / item.scale + this.getTopLevel(this.activeLevel));
    }

    for (let y = this.getTopLevel(this.activeLevel);
         y <= item.canvas.height / item.scale + this.getTopLevel(this.activeLevel); y += 100) {
      dc.moveTo(this.getLeftLevel(this.activeLevel), y);
      dc.lineTo(item.canvas.width / item.scale + this.getLeftLevel(this.activeLevel), y);
    }
    dc.strokeStyle = '#669c41';
    dc.stroke();
    dc.restore();
  }


  getActiveLevel(): number
  {
    return this.activeLevel = this.activeLevel === undefined ? 0 : this.activeLevel;
  }

  getLabelWeight(level: LevelAdminka, label: LabelsAdminka): number
  {
    return label.weight > 0 ? label.weight : level.weight;
  }


  getMinPointSize(): number {
    if (this.pointSize === undefined) {
      let pointSize = 999999;
      this.jobsService.job?.levels.map((level: LevelAdminka) => {pointSize = Math.min(pointSize, level.point_size);});
      this.pointSize = pointSize;
    }
    return this.pointSize;
  }

  // getLabelSize(level: LevelAdminka, label: LabelsAdminka): number
  getLabelSize(item: CanvasShell): number
  {
    return this.getMinPointSize() / item.scale;
    // return (label.point_size > 0 ? label.point_size : level.point_size) / this.scale;
  }

  // getLabelLineHeight(level: LevelAdminka, label: LabelsAdminka): number
  getLabelLineHeight(item: CanvasShell): number
  {
    return this.getLabelSize(item) * 1.2;
    // return Math.ceil(this.getLabelSize(level, label) * 1.25);
  }

  getLabelFamily(level: LevelAdminka, label: LabelsAdminka): string
  {
    return label.family !== '' ? label.family : level.family;
  }

  getCanvasFont(level: LevelAdminka, label: LabelsAdminka, item: CanvasShell, k = 1): string
  {
    return this.getLabelWeight(level, label) + ' ' + k * (this.getLabelSize(item) / this.getScaleWorldForLevel(level.index)) + 'pt '
      + this.getLabelFamily(level, label);
  }


  drawLabels(level: LevelAdminka, dc: CanvasRenderingContext2D, item: CanvasShell): void
  {
      const labelLineHeight = this.getLabelLineHeight(item) / this.getScaleWorldForLevel(level.index);
      dc.save();
      dc.fillStyle = 'black';
      dc.textBaseline = 'top';
      dc.textAlign = 'center';
      this.jobsService.job?.labels.filter((label: LabelsAdminka): boolean => this.filterLevelLabel(label, level.index) )
        .forEach((label: LabelsAdminka) => {
          if (label.text && ((label.scale || 1) < item.scale && (label.scale || 0) !== 0 || item.scale >= this.textLabelScale )) {
            dc.font = this.getCanvasFont(level, label, item);
            const lines = label.text.split(/(<BR>|<br>|\\n)/);
            lines.length <= 1 ? this.drawSingleLine(dc, label.wx, label.wy, label.text)
              : this.drawMultiLine(dc, label.wx, label.wy, lines, labelLineHeight);
          }
        });
      dc.restore();
  }

  drawSingleLine(dc: CanvasRenderingContext2D, x: number, y: number, text: string): void
  {
    dc.save();
    dc.transform(1, 0, 0, 1, x, y );
    dc.transform(1, 0, 0, -1, 0, 0 );
    dc.fillText(text, 0, 0);
    dc.restore();
  }

  drawMultiLine(dc: CanvasRenderingContext2D, x: number, y: number, lines: string[], lineHeight: number): void
  {
    y += lineHeight * lines.length * 0.5;
    lines.forEach((line: string) => {
      if (!/(<BR>|<br>|\\n)/.test(line)) {
        this.drawSingleLine(dc, x, y, line);
        y -= lineHeight;
      }
    });
  }

  drawRectangle(level: number, dc: CanvasRenderingContext2D): void
  {
    dc.save();
    dc.strokeRect(0, 0, this.getWidthLevel(level), this.getHeightLevel(level));
    dc.restore();
  }

  drawNameLevel(level: LevelAdminka, dc: CanvasRenderingContext2D, item: CanvasShell): void
  {
    if (this.isDrawNameLevel) {
      dc.save();
      const scaleWorld = this.getScaleWorldForLevel(level.index);
      dc.transform(1, 0, 0, -1,this.getShiftWorldLeft(level.index) / scaleWorld, (this.getHeightLevel(level.index) + this.getShiftWorldBottom(level.index)) / scaleWorld);
      dc.font = this.getCanvasFont(level, this.jobsService.job.labels[0], item, 3);
      dc.fillText(level.title, 0, 0);
      dc.restore()
    }
  }


  getLeftLevel(level?: number | undefined ): number
  {
    return this.levelA(level)?.left || 0;
  }

  getTopLevel(level?: number | undefined ): number
  {
    return this.levelA(level)?.top || 0;
  }

  getRightLevel(level?: number | undefined ): number
  {
    return this.levelA(level)?.right || 0;
  }

  getBottomLevel(level?: number | undefined ): number
  {
    return this.levelA(level)?.bottom || 0;
  }

  getWidthLevel(level?: number | undefined ): number
  {
    return this.getRightLevel(level) - this.getLeftLevel(level);
  }

  getWidthWell(level?: number | undefined ): number
  {
    return (this.jobsService.wallsMaxX[(level || 0)] - this.jobsService.wallsMinX[(level || 0)]) * this.getScaleWorldForLevel(level || 0);
  }

  getHeightLevel(level?: number | undefined ): number
  {
    return this.getBottomLevel(level) - this.getTopLevel(level);
  }

  getHeightWell(level?: number | undefined ): number
  {
    return (this.jobsService.wallsMaxY[(level || 0)] - this.jobsService.wallsMinY[(level || 0)]) * this.getScaleWorldForLevel(level || 0);
  }

  drawHotspots(level: number, dc: CanvasRenderingContext2D, item: CanvasShell): void
  {
    const dw = 16 / (item.scale * this.getScaleWorldForLevel(level));
    const dh = dw;
    const percent = (new Date()).getMilliseconds()/1000;
    const radius = 2 + 6 * percent;

    this.jobsService?.job?.get_photos_original?.filter( (photo: Photo) => this.filterLevelPhoto(photo, level)).forEach((photo: Photo) => {
      if ((this.sizeComponentService.showAllHotspots || this.getActiveImg().index === photo.index) && photo.deleted === 0) {
        dc.save();
        if (this.getActiveImg().index === photo.index) {
          let dir = (photo.hotspot?.dir || 0) * 0.3925 + 1.5708;
          if ( dir < 0){ dir = 6.28 + dir; }
          this.drawOnePin(dc, (photo.hotspot?.wx || 0), (photo.hotspot?.wy || 0), dir, dw, dh);
          photo.show = true;
        } else {
          this.drawOneArc(dc, (photo.hotspot?.wx || 0), (photo.hotspot?.wy || 0), photo.show, radius, photo.showClick, 0.5 - percent*0.5);
        }
        dc.restore();
      }
    });
  }


  drawOneArc(dc: CanvasRenderingContext2D, x: number, y: number, show: boolean, radius = 0.1, showClick = false, percent = 0): void {
    dc.beginPath();
    dc.arc(x, y, radius, 0, 2 * Math.PI);
    dc.fillStyle = show && showClick ? "rgba(0, 255, 0, "+ percent +")" : "rgba(255, 0, 0, "+ percent +")";
    dc.fill();
    dc.lineWidth = 5;
    dc.strokeStyle = '#003300';
  }

  drawOnePin(dc: CanvasRenderingContext2D, x: number, y: number, dir: number, dw: number, dh: number, pinScale = 1.6): void {
    dc.beginPath();
    dc.translate(x, y);
    dc.rotate(dir + 3.14159);
    dc.drawImage(this.imgPin, -dw * pinScale * 0.5,  -dh * pinScale * 0.5, dw * pinScale , dh * pinScale);
    dc.fill();
  }

  clearCanvas(dc: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    dc.save();
    dc.setTransform(1, 0, 0, 1, 0, 0);
    dc.clearRect(0, 0, canvas.width, canvas.height);
    dc.fillStyle = "rgba(0,0,0,0)";
    dc.fillRect(0, 0, canvas.width, canvas.height);
    dc.restore();
  }

  viewAll(): void {
    this.fitAllFlag = true;
  }

  viewAllLevels(start = false): void {
    this.k = start ? this.k_mid : 0.8;
    this.fitAllLevelsFlag = true;
  }


  startAnimation(item: CanvasShell, finishLevel: number): void {
    console.log('startAnimation');
    this.fitAllLevelsFlag = false;
    this.startAnimatin = (new Date()).getTime();
    this.durationAnimation = 1500;
    this.finishAnimatin = this.startAnimatin + this.durationAnimation ;
    this.durationAnimationLeft = this.durationAnimation;
    if (this.timerIdAnimation !== undefined) {
      clearInterval(this.timerIdAnimation);
    }



    let left: number | undefined, right: number | undefined, bottom: number | undefined, top: number | undefined;
    let leftLevel: number | undefined, topLevel: number | undefined, rightLevel: number | undefined, bottomLevel: number | undefined;

    this.jobsService.job?.levels.map(level => {
      left = left === undefined || level.left && left > level.left ? level.left : left;
      right = right === undefined || level.right && right < level.right ? level.right : right;
      bottom = bottom === undefined || level.bottom && bottom < level.bottom ? level.bottom : bottom;
      top = top === undefined || level.top && top > level.top ? level.top : top;


      leftLevel = left === level.left ? level.index : leftLevel;
      rightLevel = right === level.right ? level.index : rightLevel;
      topLevel = top === level.top ? level.index : topLevel;
      bottomLevel = bottom === level.bottom ? level.index : bottomLevel;
    })

    if (this.k_mid === this.k) {
      this.k = 0.8;
    }


    if(left !== undefined && right !== undefined && bottom !== undefined && top !== undefined) {
      item.middle.scale = Math.min(item.canvas.width / (right - left),  item.canvas.height / (bottom - top)) * this.k_mid;

      item.middle.mouseMoveShiftX2 = (item.canvas.width / item.middle.scale - (right - left)) * 0.5  - (this.getLeftLevel(leftLevel) - this.getLeftLevel(finishLevel)) ;
      item.middle.mouseMoveShiftY2 = (item.canvas.height / item.middle.scale - (bottom - top) ) * 0.5  - (this.getTopLevel(topLevel) - this.getTopLevel(finishLevel)) ;

    }


    item.finish.scale = Math.min(item.canvas.width / this.getWidthLevel(finishLevel), item.canvas.height / this.getHeightLevel(finishLevel)) * this.k;
    item.finish.mouseMoveShiftX = (item.canvas.width / item.finish.scale - this.getWidthLevel(finishLevel)) * 0.5;
    item.finish.mouseMoveShiftY = (item.canvas.height / item.finish.scale - this.getHeightLevel(finishLevel)) * 0.65;


    this.activeLevel = finishLevel;
    this.timerIdAnimation = window.setInterval(() => {
      const now = (new Date()).getTime();
      if (this.startAnimatin && this.durationAnimationLeft > 0) {
        this.durationAnimationLeft =  this.durationAnimationLeft - (now - this.startAnimatin);
        this.startAnimatin = now;
        const percent = 1 - this.durationAnimationLeft / this.durationAnimation;

        item.scale = item.middle.scale - (item.middle.scale - item.finish.scale) * percent;
        item.mouseMoveShiftX = (item.middle.mouseMoveShiftX2 - (item.middle.mouseMoveShiftX2 - item.finish.mouseMoveShiftX)  * Math.cbrt(percent));
        item.mouseMoveShiftY = (item.middle.mouseMoveShiftY2 - (item.middle.mouseMoveShiftY2 - item.finish.mouseMoveShiftY)  * Math.cbrt(percent));

      } else {
        this.setFitAll(item);
        this.getDefaultActiveCamIndex(finishLevel);

        if (this.timerIdAnimation !== undefined) {
          this.durationAnimationLeft = 0;
          clearInterval(this.timerIdAnimation);
          this.timerIdAnimation = undefined;
        }
      }

    }, 1000/60);

  }


  viewAllAnimation(item: CanvasShell, startLevel: number, finishLevel: number): void {
    console.log('viewAllAnimation');
    this.startAnimatin = (new Date()).getTime();
    this.durationAnimation = 3000;
    this.finishAnimatin = this.startAnimatin + this.durationAnimation ;
    this.durationAnimationLeft = this.durationAnimation;
    if (this.timerIdAnimation !== undefined) {
      clearInterval(this.timerIdAnimation);
    }

    let left: number | undefined, right: number | undefined, bottom: number | undefined, top: number | undefined;
    let leftLevel: number | undefined, topLevel: number | undefined, rightLevel: number | undefined, bottomLevel: number | undefined;

    this.jobsService.job?.levels.map(level => {
      left = left === undefined || level.left && left > level.left ? level.left : left;
      right = right === undefined || level.right && right < level.right ? level.right : right;
      bottom = bottom === undefined || level.bottom && bottom < level.bottom ? level.bottom : bottom;
      top = top === undefined || level.top && top > level.top ? level.top : top;


      leftLevel = left === level.left ? level.index : leftLevel;
      rightLevel = right === level.right ? level.index : rightLevel;
      topLevel = top === level.top ? level.index : topLevel;
      bottomLevel = bottom === level.bottom ? level.index : bottomLevel;
    })


    item.start.scale = Math.min(item.canvas.width / this.getWidthLevel(startLevel), item.canvas.height / this.getHeightLevel(startLevel)) * this.k ;
    item.start.mouseMoveShiftX = (item.canvas.width / item.start.scale - this.getWidthLevel(startLevel)) * 0.5;
    item.start.mouseMoveShiftY = (item.canvas.height / item.start.scale - this.getHeightLevel(startLevel)) * 0.5;


    if(left !== undefined && right !== undefined && bottom !== undefined && top !== undefined) {
      item.middle.scale = Math.min(item.canvas.width / (right - left),  item.canvas.height / (bottom - top)) * this.k_mid;
      item.middle.mouseMoveShiftX1 = (item.canvas.width / item.middle.scale - (right - left)) * 0.5  - (this.getLeftLevel(leftLevel) - this.getLeftLevel(startLevel)) ;
      item.middle.mouseMoveShiftY1 = (item.canvas.height / item.middle.scale - (bottom - top) ) * 0.5  - (this.getTopLevel(topLevel) - this.getTopLevel(startLevel)) ;


      item.middle.mouseMoveShiftX2 = (item.canvas.width / item.middle.scale - (right - left)) * 0.5  - (this.getLeftLevel(leftLevel) - this.getLeftLevel(finishLevel)) ;
      item.middle.mouseMoveShiftY2 = (item.canvas.height / item.middle.scale - (bottom - top) ) * 0.5  - (this.getTopLevel(topLevel) - this.getTopLevel(finishLevel)) ;

    }


    item.finish.scale = Math.min(item.canvas.width / this.getWidthLevel(finishLevel), item.canvas.height / this.getHeightLevel(finishLevel)) * this.k;
    item.finish.mouseMoveShiftX = (item.canvas.width / item.finish.scale - this.getWidthLevel(finishLevel)) * 0.5;
    item.finish.mouseMoveShiftY = (item.canvas.height / item.finish.scale - this.getHeightLevel(finishLevel)) * 0.65;


    this.timerIdAnimation = window.setInterval(() => {
      const now = new Date();
      if (this.startAnimatin && this.durationAnimationLeft > 0) {
        this.durationAnimationLeft =  this.durationAnimationLeft - (now.getTime() - this.startAnimatin);
        this.startAnimatin = now.getTime();
        const percent = 1 - this.durationAnimationLeft / this.durationAnimation;

        if (percent < 0.5) {
          this.activeLevel = startLevel;
          item.scale = item.start.scale + (item.middle.scale - item.start.scale) * percent * 2;
          item.mouseMoveShiftX = (item.start.mouseMoveShiftX + (item.middle.mouseMoveShiftX1 - item.start.mouseMoveShiftX) * percent * 2);
          item.mouseMoveShiftY = (item.start.mouseMoveShiftY + (item.middle.mouseMoveShiftY1 - item.start.mouseMoveShiftY) * percent * 2);
        } else {
          this.activeLevel = finishLevel;
          item.scale = item.middle.scale - (item.middle.scale - item.finish.scale) * (percent - 0.5) * 2;
          item.mouseMoveShiftX = (item.middle.mouseMoveShiftX2 - (item.middle.mouseMoveShiftX2 - item.finish.mouseMoveShiftX)  * (percent - 0.5) * 2);
          item.mouseMoveShiftY = (item.middle.mouseMoveShiftY2 - (item.middle.mouseMoveShiftY2 - item.finish.mouseMoveShiftY)  * (percent - 0.5) * 2);
        }

      } else {
        this.setFitAll(item);
        this.getDefaultActiveCamIndex(finishLevel);

        if (this.timerIdAnimation !== undefined) {
          this.durationAnimationLeft = 0;
          clearInterval(this.timerIdAnimation);
          this.timerIdAnimation = undefined;
        }
      }

    }, 1000/60);
  }

  setScaleForShowCenterFloor(level: number, item: CanvasShell): void
  {
    item.scale = Math.min(item.canvas.width / this.getWidthLevel(level),
      item.canvas.height / this.getHeightLevel(level)) * this.k;
  }

  setMouseMoveCenterFloor(level: number, item: CanvasShell): void
  {
    if (this.position === 'center') {
      item.mouseMoveShiftX = (item.canvas.width / item.scale - this.getWidthLevel(level)) * 0.5 ;
      item.mouseMoveShiftY = (item.canvas.height / item.scale - this.getHeightLevel(level)) * 0.65 ;
    } else if (this.position === 'top rigth') {
      item.mouseMoveShiftX = (item.canvas.width / item.scale - this.getWidthLevel(level)) ;
      item.mouseMoveShiftY = (item.canvas.height / item.scale - this.getHeightLevel(level)) * 0.1 ;
    }
  }

  setFitAll(item: CanvasShell): void {
    this.setScaleForShowCenterFloor(this.getActiveLevel(), item);
    this.setMouseMoveCenterFloor(this.getActiveLevel(), item);
  }

  setFitAllLevels(item: CanvasShell): void {

    let left: number | undefined, right: number | undefined, bottom: number | undefined, top: number | undefined;
    let leftLevel: number | undefined, topLevel: number | undefined, rightLevel: number | undefined, bottomLevel: number | undefined;

    this.jobsService.job?.levels.map(level => {
      left = left === undefined || level.left && left > level.left ? level.left : left;
      right = right === undefined || level.right && right < level.right ? level.right : right;
      bottom = bottom === undefined || level.bottom && bottom < level.bottom ? level.bottom : bottom;
      top = top === undefined || level.top && top > level.top ? level.top : top;


      leftLevel = left === level.left ? level.index : leftLevel;
      rightLevel = right === level.right ? level.index : rightLevel;
      topLevel = top === level.top ? level.index : topLevel;
      bottomLevel = bottom === level.bottom ? level.index : bottomLevel;
    })


    if(left !== undefined && right !== undefined && bottom !== undefined && top !== undefined) {
      item.scale = Math.min(item.canvas.width / (right - left),  item.canvas.height / (bottom - top)) * this.k;
      item.mouseMoveShiftX = (item.canvas.width / item.scale - (right - left)) * 0.5  - (this.getLeftLevel(leftLevel) - this.getLeftLevel(this.getActiveLevel())) ;
      item.mouseMoveShiftY = (item.canvas.height / item.scale - (bottom - top) ) * 0.5  - (this.getTopLevel(topLevel) - this.getTopLevel(this.getActiveLevel())) ;
    }

  }

  setStartPositionCanvas(dc: CanvasRenderingContext2D, item: CanvasShell): void {
    dc.setTransform(item.scale, 0, 0, item.scale,
      -this.getLeftLevel(this.activeLevel) * item.scale,
      -this.getTopLevel(this.activeLevel) * item.scale);
  }

  drawFloor(level: number, dc: CanvasRenderingContext2D, item: CanvasShell): void {
    dc.save();

    if (this.measureMode) {
      dc.globalAlpha = 0.35;
    }

    window.dc = dc;
    window.scale = item.scale;
    window.DetailedScale = this.DetailedScale;
    try {
      // @ts-ignore
      window['DrawFloor' + level]();
      dc.save();
      dc.transform(1, 0, 0, -1, 0, 0 );
      // @ts-ignore
      window['DrawAdornments' + level]();
      dc.restore();
    } catch (e) {
      console.error('Canvas not load', e);
    }
    dc.restore();
  }
}

