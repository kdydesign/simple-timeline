// A month menu is portalled outside the blurred calendar to avoid clipping.
// Keep its owning date picker in the focus/dismissal scope without moving the DOM back inside.
export function ownsOverlayTarget(scope:HTMLElement,target:EventTarget|null):boolean {
 if(!(target instanceof Node))return false
 if(scope.contains(target))return true
 const owner=target instanceof Element?target.closest<HTMLElement>('[data-select-owner]')?.dataset.selectOwner:undefined
 return !!owner&&scope.contains(document.getElementById(owner))
}
