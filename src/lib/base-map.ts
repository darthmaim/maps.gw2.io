import {FeatureGroup, ImageOverlay, LatLng, Layer, Map, PointTuple, Polyline, svg,} from 'leaflet';
import {combineLatestWith, filter, interval, map, Subscription, switchMap, take, tap} from "rxjs";
import {MqttService} from "ngx-mqtt";
import {LabelService} from "../services/label.service";
import {LiveMarkersService} from "../services/live-markers.service";
import {ActivatedRoute, Router} from "@angular/router";
import {NgZone} from "@angular/core";
import {MarkerLabel} from "../services/asset.service";
import {LayerService} from "../services/layer.service";
import {ToastrService} from "ngx-toastr";

export interface LayerOptions {
  layer: Layer;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  opacityLevels?: {[zoomLevel: number]: number};

  friendlyName?: string;
  icon?: string;
  state: LayerState;
}

export enum LayerState {
  Enabled,
  Disabled,
  Hidden,
  Pinned,
}

export class BaseMap {
  CONTINENT_ID: number = 1 as const;

  Map!: Map;
  mapLayers: {[key: string]: LayerOptions} = {};

  constructor(
    private ngZone: NgZone,
    private mqttService: MqttService,
    private labelService: LabelService,
    private liveMarkersService: LiveMarkersService,
    protected toastr: ToastrService,
    protected layerService: LayerService,
    protected route: ActivatedRoute,
    protected router: Router) {
  }

  onMapInitialised(leaflet: Map) {

    // Live Markers
    const liveLayer = new FeatureGroup();
    this.registerLayer("LIVE_MAP", { friendlyName: "Live Map", icon: "/assets/player_marker.png", state: LayerState.Enabled, layer: liveLayer});
    this.liveMarkersService.setActiveMapLayer(leaflet, liveLayer);

    // LatLng Url
    this.router.routerState.root.fragment.pipe(
      combineLatestWith(this.route.params),
      filter(([fragment, params]) => !!fragment && !("chatLink" in params)),
      take(1),
      map(([fragment, _]) => fragment!.split(",").map(f => parseInt(f))),
      map(([lat, lng, zoom]): [LatLng, number] => [new LatLng(lat, lng), zoom])
    ).subscribe(([latLng, zoom]) => this.Map.setView(latLng, zoom));

    // Direct link to Markers
    this.route.params.pipe(
      map(params=> params["chatLink"]),
      take(1),
      filter(chatLink => !!chatLink),
      map((chatLink: string) => {
        if (chatLink.startsWith("[")) // Clean up the chat link
          chatLink = chatLink.substring(1);
        if (chatLink.endsWith("]"))
          chatLink = chatLink.substring(0, chatLink.length - 1);
        if (chatLink.endsWith("="))
          chatLink = chatLink.substring(0, chatLink.length - 1);

        return chatLink;
      }),
      switchMap(chatLink => this.layerService.getMarkerByChatLink(this.CONTINENT_ID, 1, chatLink)),
    ).subscribe((marker: MarkerLabel | undefined) => {
      if (!marker) {
        this.toastr.warning("Failed to find marker from url", "", {
          toastClass: "custom-toastr",
          positionClass: "toast-top-right"
        });
        return;
      }

      this.layerService.createImageOverlay(leaflet, marker.coordinates, "/assets/small_drawn_circle.png")
        .addTo(leaflet).bringToFront();

      this.panTo(marker.coordinates, 7);
    })

    this.Map.on("zoomend", () => this.ngZone.run(() => this.router.navigate([], { replaceUrl: true, fragment: [this.Map.getCenter().lat, this.Map.getCenter().lng, this.Map.getZoom()].join(",") })));
    this.Map.on("moveend", () => this.ngZone.run(() => this.router.navigate([], { replaceUrl: true, fragment: [this.Map.getCenter().lat, this.Map.getCenter().lng, this.Map.getZoom()].join(",") })));

    // Drawing
    this.Map.on("mousedown", ($event) => {
      if ($event.originalEvent.button == this.RIGHT_MB) {
        this.createLine()
      }
    })
  }

  public panTo(coords: PointTuple, zoom: number = 4) {
    const latLng = this.Map.unproject(coords, this.Map.getMaxZoom());
    console.trace();
    this.Map.setView(latLng, zoom);
  }

  updateLayer(id: string, layer: Layer) {
    if (this.hasLayer(id)) {
      this.Map.addLayer(layer);
      this.Map.removeLayer(this.mapLayers[id].layer);

      this.mapLayers[id].layer = layer;
    }
  }

  hasLayer(id: string): boolean {
    return id in this.mapLayers;
  }

  registerLayer(id: string, options: LayerOptions) {
    if (this.hasLayer(id)) {
      console.warn("attempted to register duplicate layer as " + id);
      return;
    }

    this.mapLayers[id] = {
      ...options,
      friendlyName: options.friendlyName ?? id
    };

    if (this.Map) {
      if (options.state != LayerState.Disabled) {
        this.Map.addLayer(options.layer);
      }

      this.updateLayerVisibility(this.Map.getZoom())
    }
  }

  unregisterLayer(id: string) {
    if (this.mapLayers[id]) {
      this.Map.removeLayer(this.mapLayers[id].layer);
      delete this.mapLayers[id];
    }
  }

  showLayer(id: string) {
    if (this.mapLayers[id]) {
      const options = this.mapLayers[id];

      if (!this.Map.hasLayer(options.layer)) {
        this.Map.addLayer(options.layer);
      }
    }
  }

  hideLayer(id: string) {
    if (this.mapLayers[id]) {
      const options = this.mapLayers[id];

      if (this.Map.hasLayer(options.layer)) {
        this.Map.removeLayer(options.layer);
      }
    }
  }

  updateLayerOpacity(id: string, zoomLevel: number) {
    if (this.mapLayers[id]) {
      const options = this.mapLayers[id];

      if (options.opacityLevels) {
        if (zoomLevel in options.opacityLevels) {
          (options.layer as ImageOverlay).setOpacity(options.opacityLevels[zoomLevel]);
        } else {
          (options.layer as ImageOverlay).setOpacity(1);
        }
      }
    }
  }

  updateLayerVisibility(zoomLevel: number) {
    if (!this.Map) {
      return;
    }

    for (let layersKey in this.mapLayers) {
      const layerOptions = this.mapLayers[layersKey];
      let newState: LayerState = layerOptions.state;

      const withinZoom = this.withinZoomRange(layersKey, zoomLevel);
      const disabledOrPinned = layerOptions.state == LayerState.Disabled || layerOptions.state == LayerState.Pinned;

      // If the layer is disabled or pinned, we don't want to change the state
      if (!disabledOrPinned) {
        if (withinZoom) {
          newState = LayerState.Enabled;
        } else {
          newState = LayerState.Hidden;
        }
      }

      layerOptions.state = newState;
      this.processLayer(layersKey, zoomLevel);
    }
  }

  withinZoomRange(id: string, zoomLevel: number): boolean {
    if (this.mapLayers[id]) {
      const options = this.mapLayers[id];
      const minZoom = options.minZoomLevel ?? this.Map.getMinZoom();
      const maxZoom = options.maxZoomLevel ?? this.Map.getMaxZoom();

      return zoomLevel >= minZoom && zoomLevel <= maxZoom;
    }

    return false;
  }

  processLayer(id: string, zoomLevel: number = this.Map.getZoom()) {
    if (this.mapLayers[id]) {
      const state = this.mapLayers[id].state;
      switch (state as LayerState) {
        case LayerState.Enabled:
          if (this.withinZoomRange(id, zoomLevel)) {
            this.showLayer(id);
            this.updateLayerOpacity(id, zoomLevel);
          }
          break;
        case LayerState.Disabled:
          this.hideLayer(id);
          break;
        case LayerState.Hidden:
          this.hideLayer(id);
          break;
        case LayerState.Pinned:
          this.showLayer(id);
          break;
      }
    }
  }

  layerUpdated([$layer, $state]: [string, LayerState]) {
    this.mapLayers[$layer].state = $state;
    this.processLayer($layer, this.Map.getZoom());
  }

  private RIGHT_MB = 2
  private createLine() {
    const line = new Polyline([], { color: "#DDD", opacity: 0.9, renderer: svg(), interactive: false }).addTo(this.Map)
    let isDrawing = true;
    let trimLine: Subscription;

    this.Map.on("mousemove", ($event) => {
      if (isDrawing) {
        line.addLatLng($event.latlng)
      }
    })
    this.Map.once("mouseup", (_) => {
      isDrawing = false
      trimLine = interval(100).pipe(
        take(100)
      ).subscribe({
        next: i =>
          line.setStyle({
            opacity: 1.0 - (i * .01)
          })
        ,
        complete: () => line.removeFrom(this.Map)
      })
    })
  }
}
