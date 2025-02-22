import {Component, EventEmitter, Input, Output} from '@angular/core';

@Component({
  selector: 'app-about-modal',
  templateUrl: './about-modal.component.html',
  styleUrls: ['./about-modal.component.css']
})
export class AboutModalComponent {
  @Input()
  visible!: boolean;
  @Output()
  visibleChange: EventEmitter<boolean> = new EventEmitter<boolean>();

  constructor() {
  }

  openDiscord = () => window.open("https://discord.gg/8vCN5RBz75", "_blank");
  openGithub = () => window.open("https://github.com/Snappey/maps.gw2.io/", "_blank");
  openGithubIssues = () => window.open("https://github.com/Snappey/maps.gw2.io/issues/new", "_blank");

  close() {
    this.visible = false;
    this.visibleChange.emit(false)
  }
}
