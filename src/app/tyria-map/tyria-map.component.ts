import {Component, isDevMode, NgZone, OnDestroy, OnInit} from '@angular/core';
import {ToastrService} from 'ngx-toastr';
import {debounceTime, fromEvent, map, Observable, Subject, take, takeUntil, tap} from 'rxjs';
import {CRS, LatLng, latLng, LatLngBounds, LeafletEvent, LeafletMouseEvent, Map, PointTuple,} from 'leaflet';
import "leaflet-contextmenu"
import {LayerService} from "../../services/layer.service";
import {EditorService, MarkerType} from "../../services/editor.service";
import {DialogService} from "primeng/dynamicdialog";
import {EditorModalComponent} from "./editor-modal/editor-modal.component";
import {ClipboardService} from "ngx-clipboard";
import {Event, EventMap, EventTimerService} from "../../services/event-timer.service";
import {BaseMap, LayerState} from "../../lib/base-map";
import {ActivatedRoute, Router} from "@angular/router";
import {MqttService} from "ngx-mqtt";
import {LabelService} from "../../services/label.service";
import {LiveMarkersService} from "../../services/live-markers.service";
import {liveMarkersActions} from "../../state/live-markers/live-markers.action";
import {Store} from "@ngrx/store";
import {AppState} from "../../state/appState";
import {ToolbarButton} from "../toolbar/toolbar.component";
import {environment} from "../../environments/environment";

@Component({
  selector: 'tyria-map',
  templateUrl: './tyria-map.component.html',
  styleUrls: ['./tyria-map.component.css'],
  providers: [DialogService]
})
export class TyriaMapComponent extends BaseMap implements OnInit, OnDestroy {
  override CONTINENT_ID = 1 as const;
  FLOOR_ID = 1 as const

  showLayers: boolean = false;
  showEvents: boolean = false;
  showSettings: boolean = false;
  showAbout: boolean = false;
  showLiveMarkers: boolean = false;
  showWizardsVault: boolean = false;

  private searchUnfocused: Subject<any> = new Subject<any>();
  showSearchResults: boolean = false;

  private unsubscribe$ = new Subject<void>();

  leftToolbar: ToolbarButton[] = [
    {
      Tooltip: "Info",
      Icon: "/assets/about_icon.png",
      IconHover: "/assets/about_hovered_icon.png",
      OnClick: () => this.showAbout = !this.showAbout
    },
    {
      Tooltip: "Settings",
      Icon: "/assets/settings_icon.png",
      IconHover: "/assets/settings_hovered_icon.png",
      OnClick: () => this.showSettings = !this.showSettings
    },
    {
      Tooltip: "Layers",
      Icon: "/assets/layer_icon.png",
      IconHover: "/assets/layer_hovered_icon.png",
      OnClick: () => this.showLayers = !this.showLayers,
      Keybindings: ["Digit1"]
    },
    {
      Tooltip: "Live Markers",
      Icon: "/assets/friends_icon.png",
      IconHover: "/assets/friends_hovered_icon.png",
      OnClick: () => this.showLiveMarkers = !this.showLiveMarkers,
      Keybindings: ["Digit2"]
    },
    {
      Tooltip: "World Bosses",
      Icon: "/assets/event_icon.png",
      IconHover: "/assets/event_hovered_icon.png",
      OnClick: () => this.showEvents = !this.showEvents,
      Keybindings: ["Digit3"]
    },
    {
      Tooltip: "Wizards Vault",
      Icon: "/assets/wizard_vault_icon.png",
      IconHover: "/assets/wizard_vault_hovered_icon.png",
      OnClick: () => this.showWizardsVault = !this.showWizardsVault,
      Keybindings: ["Digit4"]
    }
  ]

  rightToolbar: ToolbarButton[] = [
    {
      Tooltip: "WvW",
      Icon: "/assets/mists_icon.png",
      IconHover: "/assets/mists_hovered_icon.png",
      OnClick: () => this.router.navigate(["/wvw"])
    }
  ]

  constructor(
    private dialogService: DialogService,
    toastr: ToastrService,

    private editorService: EditorService,
    private clipboardService: ClipboardService,
    private eventTimerService: EventTimerService,
    private store: Store<AppState>,
    layerService: LayerService,
    ngZone: NgZone,
    mqttService: MqttService,
    labelService: LabelService,
    liveMarkerService: LiveMarkersService,
    router: Router,
    route: ActivatedRoute,
  ) {
    super(ngZone, mqttService, labelService, liveMarkerService, toastr, layerService, route, router)

    // Setup Searchbox debouncing
    this.searchUnfocused.pipe(
      debounceTime(500),
      takeUntil(this.unsubscribe$)
    ).subscribe(() => {
      this.showSearchResults = false
    })

    fromEvent(window, 'resize')
      .pipe(
        debounceTime(200),
        map(this.checkScreenSize),
        takeUntil(this.unsubscribe$)
      ).subscribe((small) => this.smallScreen = small);
  }

  checkScreenSize = () => document.body.offsetWidth < 1024;
  smallScreen: boolean = document.body.offsetWidth < 1024;

  ngOnInit() {
    this.store.dispatch(liveMarkersActions.setActiveContinent({ continentId: this.CONTINENT_ID }))
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  upcomingEvents$: Observable<EventMap> =
    this.eventTimerService.getNextEventsTimer(8).pipe(
      tap((events) => {
        const layer = this.eventTimerService.createEventsLayer(this.Map, events);
        if (!this.hasLayer("events_layer")) {
          this.registerLayer("events_layer", {layer: layer, friendlyName: "World Bosses", icon: "/assets/event-boss.png", state: LayerState.Enabled})
        } else {
          this.updateLayer("events_layer", layer);
        }
      }),
      takeUntil(this.unsubscribe$)
    );

  getCoords(latlng: LatLng): PointTuple {
    if (this.Map) {
      const coords = this.Map.project(latlng, this.Map.getMaxZoom());
      return [coords.x, coords.y] as PointTuple;
    }
    return [0,0];
  }

  options = {
    preferCanvas: true,
    maxNativeZoom: 9,
    maxZoom: 7,
    zoom: 3,
    zoomControl: false,
    center: latLng(-260, 365),
    contextmenu: isDevMode(),
    contextmenuWidth: 140,
    contextmenuItems: [{
      text: "Place Waypoint",
      icon: 'assets/waypoint.png',
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Waypoint", MarkerType.Waypoint, this.getCoords(e.latlng))
    },
    {
      text: "Place PoI",
      icon: 'assets/poi.png',
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Point of Interest", MarkerType.Poi, this.getCoords(e.latlng))
    },
    {
      text: "Place Vista",
      icon: "assets/vista.png",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Vista", MarkerType.Vista, this.getCoords(e.latlng))
    },
    {
      text: "Place Heart",
      icon: "assets/hearts.png",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Heart", MarkerType.Heart, this.getCoords(e.latlng))
    },
    {
      text: "Place Mastery",
      icon: "assets/core_mastery.png",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Mastery", MarkerType.Mastery, this.getCoords(e.latlng))
    },
    {
      text: "Place Hero Point",
      icon: "assets/heropoint.png",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Hero Point", MarkerType.SkillPoint, this.getCoords(e.latlng))
    },
    {
      text: "Place Unlock",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Unlock Point", MarkerType.Unlock, this.getCoords(e.latlng))
    },
    "-",
    {
      text: "Place Region Text",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Region Text", MarkerType.Region, this.getCoords(e.latlng))
    },
    {
      text: "Place Map Text",
      callback: (e: LeafletMouseEvent) =>
        this.placeMarker("Place Map Text", MarkerType.Map, this.getCoords(e.latlng))
    },
    "-",
    {
      text: "Copy Marker JSON",
      callback: (_: LeafletMouseEvent) =>
        this.editorService.copyMarkerData()
    },
    {
      text: "Copy Text JSON",
      callback: (_: LeafletMouseEvent) =>
        this.editorService.copyTextData()
    },
    "-",
    {
      text: "Centre On",
      icon: 'assets/zoom-in.png',
      callback: (e: LeafletMouseEvent) => this.Map?.panTo(e.latlng)
    },
      {
        text: "Copy Coordinates",
        callback: (e: LeafletMouseEvent) => this.clipboardService.copy(JSON.stringify(this.getCoords(e.latlng)))
      }]
  }

  placeMarker(header: string, type: MarkerType, coords: PointTuple) {
    if (this.Map) {
      this.dialogService.open(EditorModalComponent, {
        header: header,
        data: {
          type: type,
          coords: coords,
        }
      }).onClose.pipe(
        takeUntil(this.unsubscribe$),
      ).subscribe(res => {
        if (this.Map)
          if (type === MarkerType.Map || type === MarkerType.Region) {
            this.editorService.addText(this.Map, type, coords, res);
          } else {
            this.editorService.addMarker(this.Map, type, coords, res);
          }
      });
    }
  }

  onMapReady(leaflet: Map) {
    this.Map = leaflet;

    leaflet.options.crs = CRS.Simple;
    leaflet.options.maxBoundsViscosity = 1;
    leaflet.setMaxBounds(new LatLngBounds(
        leaflet.unproject([0, 0], leaflet.getMaxZoom()),
        leaflet.unproject(this.layerService.tyriaDimensions, leaflet.getMaxZoom())
    ));

    this.registerLayer("core", {
      layer: this.layerService.getTyriaTiles(),
      friendlyName: "Tyria",
      icon: "/assets/tyria_icon.png",
      state: LayerState.Enabled,
    });

    this.layerService.getWaypointLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("waypoints", { layer: layer, minZoomLevel: 5, friendlyName: "Waypoints", icon: "/assets/waypoint.png", state: LayerState.Enabled}))

    this.layerService.getLandmarkLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("landmarks", { layer: layer, minZoomLevel: 6, friendlyName: "Points of Interest", icon: "/assets/poi.png", state: LayerState.Enabled}))

    this.layerService.getVistaLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("vista", { layer: layer, minZoomLevel: 6, friendlyName: "Vistas", icon: "/assets/vista.png", state: LayerState.Enabled }))

    this.layerService.getUnlockLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("unlocks", { layer: layer, minZoomLevel: 4, friendlyName: "Instanced Content", icon: "/assets/commander_blue.png", state: LayerState.Enabled }))

    this.layerService.getHeartLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("heart_labels", {layer: layer, minZoomLevel: 6, friendlyName: "Hearts", icon: "/assets/hearts.png", state: LayerState.Enabled}))

    this.layerService.getSkillPointLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("heropoint_labels", {layer: layer, minZoomLevel: 6, friendlyName: "Hero Points", icon: "/assets/heropoint.png", state: LayerState.Enabled}))

    this.layerService.getMasteryPointLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("masteries_labels", {layer: layer, minZoomLevel: 6, friendlyName: "Masteries", icon: "/assets/core_mastery.png", state: LayerState.Enabled}))

    this.layerService.getRegionLabels(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => {
        this.registerLayer("region_labels",
          {layer: layer, maxZoomLevel: 5, minZoomLevel: 2, friendlyName: "Region Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, opacityLevels: {5: .2, 4: .6}})
        layer.bringToFront();
      });

    this.layerService.getMapLabels(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => {
        this.registerLayer("map_labels",
          {layer: layer, maxZoomLevel: 5, minZoomLevel: 3, friendlyName: "Map Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled, opacityLevels: {5: .7}})
        layer.bringToFront();
      });

    this.layerService.getAdventuresLayer(leaflet).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("adventure_labels", {layer: layer, minZoomLevel: 6, friendlyName: "Adventures", icon: "/assets/adventure_icon.png", state: LayerState.Enabled}))

    this.layerService.getSectorTextLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("sector_headings", { layer: layer, minZoomLevel: 7, friendlyName: "Sector Headings", icon: "/assets/list_icon.png", state: LayerState.Enabled }))

    this.layerService.getCityMarkersLayer(leaflet).pipe(
      take(1)
    ).subscribe(layer => this.registerLayer("city_markers", {layer: layer, minZoomLevel: 7, friendlyName: "City Markers", icon: "/assets/portal_icon.png", state: LayerState.Enabled}))


    // this.registerLayer("base_clouds", { layer: this.layerService.getBaseCloudLayer(leaflet), maxZoomLevel: 5, friendlyName: "Clouds", icon: "/assets/sky00.png", state: LayerState.Enabled, opacityLevels: {5: .2, 4: .6, 3: .8, 2: 1} })
    // this.registerLayer("extra_clouds", { layer: this.layerService.getExtraCloudLayer(leaflet), maxZoomLevel: 5, friendlyName: "Clouds", icon: "/assets/sky01.png", state: LayerState.Enabled, opacityLevels: {5: .2, 4: .6, 3: .8, 2: 1} })

    // this.layerService.getSectorLayer(leaflet, this.CONTINENT_ID, this.FLOOR_ID).pipe(
    //    take(1)
    // ).subscribe(layer => this.registerLayer("sector_polygons", { layer: layer, minZoomLevel: 7, friendlyName: "Sector Outlines", state: LayerState.Disabled }))

    if (!environment.production) {
      this.editorService.getMarkerLayerEvents().pipe(
          takeUntil(this.unsubscribe$)
      ).subscribe(layer => {
        if (!this.hasLayer("editable_markers")) {
          this.registerLayer("editable_markers", {layer: layer, minZoomLevel: 3, state: LayerState.Enabled})
        } else {
          this.updateLayer("editable_markers", layer);
        }
      });

      this.editorService.getTextLayerEvents().pipe(
          takeUntil(this.unsubscribe$)
      ).subscribe(layer => {
        if (!this.hasLayer("editable_text")) {
          this.registerLayer("editable_text", {layer: layer, maxZoomLevel: 6, minZoomLevel: 2, state: LayerState.Enabled, opacityLevels: {5: .8, 6: .5}})
        } else {
          this.updateLayer("editable_text", layer);
        }
      });
    }

    super.onMapInitialised(leaflet);
  }

  onMapDoubleClick(_: LeafletMouseEvent) {
  }

  onMapZoomFinished(_: LeafletEvent) {
    if (this.Map) {
      const zoomLevel = this.Map.getZoom();

      this.updateLayerVisibility(zoomLevel);
    }
  }

  panToEvent(event: Event) {
    if (this.Map) {
      this.panTo(event.coordinates, 5)

      this.clipboardService.copy(event.chatLink);
      this.toastr.info("Copied closest waypoint to clipboard!", event.name, {
        toastClass: "custom-toastr",
        positionClass: "toast-top-right"
      });

      this.showEvents = false;
    }
  }

  closeSearchResults() {
    this.searchUnfocused.next(0);
  }
}
