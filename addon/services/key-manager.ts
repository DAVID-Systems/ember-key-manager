import Service, {inject as service} from '@ember/service';
import Macro, { MacroOptions } from '../utils/macro';
import { TO_MODIFIER, TO_KEY } from '../utils/modifier-keys';
import { warn } from '@ember/debug';
import { isPresent } from '@ember/utils';
import {
  MODIFIERS_ON_KEYUP as MODIFIERS_ON_KEYUP_WARNING,
} from 'ember-key-manager/utils/warning-messages';
import { A } from '@ember/array';
import { capitalize } from '@ember/string';
import KeyManagerConfig from 'ember-key-manager/utils/config';

const inputElements = [
  'INPUT',
  'SELECT',
  'TEXTAREA',
];

const isInputElement = (element: HTMLElement) => {
  const isContentEditable = element.isContentEditable;
  const isInput = inputElements.includes(element.tagName);

  return isContentEditable || isInput;
};

export default class KeyManagerService extends Service {
  isDisabledOnInput = true; // hard-coded to true to remove dependency on ember-config-service
  macros = A();

  public get keydownMacros() {
    return this.macros.filterBy('keyEvent', 'keydown');
  }

  public get keyupMacros() {
    return this.macros.filterBy('keyEvent', 'keyup');
  }

  public addMacro(options: MacroOptions) {
    options = this._mergeConfigDefaults(options);
    const macro = new Macro(options);

    const keyEvent = macro.keyEvent;
    this._handleModifiersOnKeyup(macro, keyEvent);
    const element = macro.element;
    this._addEventListener(element, keyEvent);

    const macros = this.macros;
    macros.pushObject(macro);

    return macro;
  }

  public removeMacro(macro: Macro) {
    this.macros.removeObject(macro);

    this._removeEventListenter(macro.element, macro.keyEvent);
  }

  private _handleModifiersOnKeyup({ modifierKeys }: Macro, keyEvent: string) {
    if (keyEvent === 'keyup' && isPresent(modifierKeys)) {
      warn(MODIFIERS_ON_KEYUP_WARNING, false, {id: 'keyup-with-modifiers'});
    }
  }

  private _mergeConfigDefaults(options: MacroOptions) {
    if (options.isDisabledOnInput == undefined) {
      options.isDisabledOnInput = this.isDisabledOnInput;
    }
    return options;
  }

  private _addEventListener(element: HTMLElement, keyEvent: string) {
    const hasListenerForElementAndKeyEvent = this._findMacroWithElementAndKeyEvent(element, keyEvent);
    if (!hasListenerForElementAndKeyEvent) {
      element.addEventListener(keyEvent, this);
    }
  }

  private _removeEventListenter(element: HTMLElement, keyEvent: string) {
    const hasListenerForElementAndKeyEvent = this._findMacroWithElementAndKeyEvent(element, keyEvent);
    if (!hasListenerForElementAndKeyEvent) {
      element.removeEventListener(keyEvent, this);
    }
  }

  disable(recipient: any) {
    this._setDisabledState(recipient, true);
  }

  enable(recipient: any) {
    this._setDisabledState(recipient, false);
  }

  public handleEvent(event: KeyboardEvent) {
    // called by element event listener
    if (this.isDestroyed || this.isDestroying) {
      return false;
    }

    const isKeydown = event.type === 'keydown';
    const isKeyup = event.type === 'keyup';

    if (isKeydown || isKeyup) {
      const allEventModifierKeys: {[index: string]: boolean} = {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      }
      const eventModifierKeys = A(Object.keys(allEventModifierKeys)
        .filter((key) => {
          return allEventModifierKeys[key] !== false;
        }));
      const targetIsElement = event.target instanceof HTMLElement;
      const matchingMacros = targetIsElement ? this._findMatchingMacros(
        event.target as HTMLElement,
        event.key || '',
        eventModifierKeys,
        event.type
      ) : [];

      if (isPresent(matchingMacros)) {
        const isTargetInput = targetIsElement && isInputElement(event.target as HTMLElement);
        event.stopPropagation();

        matchingMacros.forEach((matchingMacro: Macro) => {
          const isDisabled = matchingMacro.isDisabled ||
            (matchingMacro.isDisabledOnInput && isTargetInput);

          if (!isDisabled) {
            matchingMacro.callback(event);
          }
        })
      }
    }
    return false;
  }

  private _findMacroWithElementAndKeyEvent(eventElement: HTMLElement, eventKeyEvent: string) {
    var events = eventKeyEvent === "keydown" ? this.keydownMacros : this.keyupMacros;
    return events.find((macro: Macro) => {
      const element = macro.element;
      return eventElement === element;
    });
  }

  private _findMatchingMacros(eventElement:HTMLElement, eventExecutionKey: string, eventModifierKeys: string[], eventKeyEvent: string) {
    var events = eventKeyEvent === "keydown" ? this.keydownMacros : this.keyupMacros;
    const matchingMacros = events.filter((macro: Macro) => {
      const element = macro.element;
      const executionKey = macro.executionKey;
      const modifierKeys = macro.modifierKeys;
      const hasElementMatch = element === eventElement || element.contains(eventElement);
      const hasExecutionKeyMatch = eventExecutionKey.toLowerCase() === executionKey.toLowerCase();
      const onlyModifierKeys = A(eventModifierKeys);
      onlyModifierKeys.removeObject(TO_MODIFIER[eventExecutionKey]);
       const hasModifierKeysMatch = onlyModifierKeys.every((key) => {
          return modifierKeys.map(k => capitalize(k)).includes(TO_KEY[key]);
        });
      const hasModifierKeyCount = eventModifierKeys.length === modifierKeys.length;

      return hasElementMatch &&
        hasExecutionKeyMatch &&
        hasModifierKeysMatch &&
        hasModifierKeyCount;
    });

    const highestPriority = A(matchingMacros).mapBy('priority')
      .reduce((max, priority) => Math.max(max, priority), -Infinity);

    return matchingMacros.filter((macro: Macro) => macro.priority === highestPriority);
  }

  private _setDisabledState(recipient: any, isDisabled: boolean) {
    if (typeof recipient === 'string') {
      this._setGroupDisabledState(recipient, isDisabled);
    } else {
      recipient.isDisabled = isDisabled;
    }
  }

  private _setGroupDisabledState(groupName: string, isDisabled: boolean) {
    this.macros.filterBy('groupName', groupName)
      .setEach('isDisabled', isDisabled);
  }
}
