import { Component, ElementRef, Renderer, Inject, Input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/platform-browser';

import { PointerPosition } from './pointer-position';
import { PointerStack } from './pointer-stack';
import * as util from './utils';

@Component({
    selector: 'nemex-viewpager',
    template:
    `<div class="viewpager"
        (mousedown)="onMouseDown($event)" (mouseup)="onMouseUp($event)" 
        (touchstart)="onMouseDown($event)" (touchend)="onMouseUp($event)"
        (window:resize)="onWindowResize($event)"
        (window:mouseout)="onWindowMouseLeave()">
    
        <div class="viewpager-content">
            <ng-content></ng-content>
        </div>

    </div>`,
    styles: [
        `.viewpager {
          display: block;
          width: 100%;
          height: 800px;
          overflow: hidden;
      }
      
      .viewpager-content {
          position: relative;
          display: block;
          height: 100%;   
      }`
    ]
})
export class ViewPagerComponent {
    // Configurables
    @Input() preventDefaultTags: string[] = ["IMG"];
    @Input() maxDeltaTimeForSlideLeave = 90; // The max time the mouse\touch should leave the screen for things to move using acceleration
    @Input() minDeltaPixelsForSlideAcceleration = 4; // The minimum delta pixels should be between the last and first points in the stack for the acceleration to work
    @Input() minPixelsToStartMove = 5;

    private mouseMoveBind: EventListener;
    private mouseMoveBound = false;
    private previousPointerPosition: PointerPosition;
    private firstPointerPosition: PointerPosition;
    private pointerStack: PointerStack = new PointerStack();
    private currentSlidingIndex = 0;
    private isNowMoving = false;
    private slidingTimer = null;

    constructor(private el: ElementRef,
        private renderer: Renderer,
        private sanitizer: DomSanitizer,
        @Inject(DOCUMENT) private document: any) {
        this.mouseMoveBind = this.onWindowMouseMove.bind(this);
    }

    get viewPagerElement() { return this.el.nativeElement.children[0]; }

    get viewPagerContentElement() { return this.viewPagerElement.children[0]; }

    get viewPagerItems() { return this.viewPagerContentElement.children; }

    get canvasWidth() { return this.viewPagerElement.clientWidth; }

    ngAfterViewInit() { this.placeElements(); }

    onMouseDown(event: Event) {
        /* Check if we should use prevent default
        if (event instanceof MouseEvent) {
            for (let tag in this.preventDefaultTags) {
                if (event.target instanceof HTMLElement && event.target.tagName == tag) {
                    // This tag prevent default should be ignored
                    event.preventDefault();
                    break;
                }
            }
        }
        */

        if (!this.mouseMoveBound) {
            this.document.addEventListener('touchmove', this.mouseMoveBind);
            this.document.addEventListener('mousemove', this.mouseMoveBind);

            // Add this position to the stack
            let pointerPosition = util.getPointerPosition(event);
            this.pointerStack.push(pointerPosition);

            this.mouseMoveBound = true;
            this.currentSlidingIndex = this.getCurrentElementInView();
        }
    }

    onWindowMouseMove(event: Event) {
        if (util.isMouseInBounds(event, this.viewPagerElement, 0, this.document)) {
            let pointerPosition = util.getPointerPosition(event);

            if (this.previousPointerPosition == null)
                this.firstPointerPosition = pointerPosition;
            else {
                let deltaPosition = pointerPosition.getDeltaPointerPosition(this.previousPointerPosition);

                if (!this.isNowMoving) {
                    let deltaFirstPosition = this.firstPointerPosition.getDeltaPointerPosition(pointerPosition);

                    // Check if the user moved enough pixels to determine it's direction
                    if (Math.abs(deltaFirstPosition.x) >= this.minPixelsToStartMove ||
                        Math.abs(deltaFirstPosition.y) >= this.minPixelsToStartMove) {

                        // If the user is trying to move to it's x axis, allow the movement
                        if (Math.abs(deltaFirstPosition.y) < Math.abs(deltaFirstPosition.x))
                            this.isNowMoving = true;
                        else {
                            // If the user is trying to move to the y axis, stop everything and let him continue
                            this.unbindAndClear();
                            return;
                        }
                    }

                }

                // Update the viewpager location according to the mouse delta position
                if (this.isNowMoving) this.viewPagerElement.scrollLeft += deltaPosition.x;
            }

            this.previousPointerPosition = pointerPosition;
            this.pointerStack.push(pointerPosition);
        }
    }

    // If the cursor left the window, act as mouse up
    onWindowMouseLeave() {
        if (this.mouseMoveBound && this.isNowMoving)
            this.onMouseUp(null);
    }

    // Update all of the elements to fit the new size of the window
    onWindowResize(event: Event) {
        this.placeElements();
    }

    onMouseUp(event: Event) {
        if (this.mouseMoveBound && this.isNowMoving) {
            // If the mouse up was called not from the mouse leave event
            if (event != null) {
                let firstPosition = this.pointerStack.first;
                let lastPosition = this.pointerStack.last;
                let deltaTime = firstPosition.date_created - lastPosition.date_created;
                let slideDirection = this.pointerStack.getSlidePosition(this.minDeltaPixelsForSlideAcceleration);

                // Check if the delta time is within the bounds to allow the slide accelration effect
                if (slideDirection != null && deltaTime <= this.maxDeltaTimeForSlideLeave) {
                    let slideSucccided = false;

                    if (slideDirection == "left" && this.canSlideLeft)
                        slideSucccided = this.slideToElement(this.currentSlidingIndex - 1);
                    else if (slideDirection == "right" && this.canSlideRight)
                        slideSucccided = this.slideToElement(this.currentSlidingIndex + 1);

                    if (slideSucccided) return;
                }
            }

            this.unbindAndClear();

            // Complete the sliding animation the user attempted to slide to
            var currentElementInView = this.getCurrentElementInView();
            this.slideToElement(currentElementInView);
        }
    }

    // Unbinds any detection of mouse or touch movements and resets everything
    unbindAndClear() {
        this.pointerStack.clear();
        document.removeEventListener('touchmove', this.mouseMoveBind);
        document.removeEventListener('mousemove', this.mouseMoveBind);
        this.previousPointerPosition = null;
        this.firstPointerPosition = null;
        this.mouseMoveBound = false;
        this.isNowMoving = false;
    }

    placeElements() {
        let index = 0;
        for (let child of this.viewPagerItems)
            this.prepareElementForViewpager(child, this.canvasWidth, index++);

        this.viewPagerContentElement.style.width = (index * this.canvasWidth) + "px";
    }

    prepareElementForViewpager(el, width, index) {
        el.style.display = "block";
        el.style.position = "absolute";
        el.style.top = "0px";
        el.style.left = (width * index) + "px";
        el.style.width = width + "px";
        el.style.height = "100%";
    }

    getCurrentElementInView(): number {
        var childrenCount = this.viewPagerItems.length;
        var currentScrollLeft = this.viewPagerElement.scrollLeft;

        // console.log("Children count: " + childrenCount + ", canvas size: " + this.canvasWidth + ", currentScrollLeft: " + currentScrollLeft);

        return Math.round(currentScrollLeft / (this.canvasWidth * (childrenCount - 1))) * (childrenCount - 1);
    }

    // The number of pixels to move when animating
    private animationPixelJump = 50;

    // The minimum delta position to stop the scrolling from
    private minDeltaToPosition = 9;

    get canSlideLeft(): boolean { return this.viewPagerItems.length > 1 && this.getCurrentElementInView() > 0; }
    get canSlideRight(): boolean { return this.getCurrentElementInView() < this.viewPagerItems.length - 1; }

    slideLeft(): boolean { return this.slideToElement(this.getCurrentElementInView() - 1); }

    slideRight(): boolean { return this.slideToElement(this.getCurrentElementInView() + 1); }

    slideToElement(index: number): boolean {
        if (this.slidingTimer) return;
        if (index < 0 || index >= this.viewPagerItems.length) {
            console.warn("Invalid indexes were specified, can't scroll to index: " + index);
            return false;
        }

        var destination = (this.canvasWidth * index);
        var viewPagerElement = this.viewPagerElement;

        // Create the sliding animations
        this.slidingTimer = setInterval(() => {
            var diff = destination - viewPagerElement.scrollLeft;

            if (Math.abs(diff) < this.minDeltaToPosition) {
                clearInterval(this.slidingTimer);
                this.slidingTimer = null;
                this.viewPagerElement.scrollLeft = destination;
                return;
            }

            if (viewPagerElement.scrollLeft < destination)
                viewPagerElement.scrollLeft += this.animationPixelJump;
            else
                viewPagerElement.scrollLeft -= this.animationPixelJump;
        }, 15);

        return true;
    }
}