// Copyright 2018 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { KeyboardEvent, ReactNode } from 'react';
import type { Options, VirtualElement } from '@popperjs/core';
import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { usePopper } from 'react-popper';
import { noop } from 'lodash';

import type { Theme } from '../util/theme';
import type { LocalizerType } from '../types/Util';
import { getClassNamesFor } from '../util/getClassNamesFor';
import { themeClassName } from '../util/theme';
import { handleOutsideClick } from '../util/handleOutsideClick';

export type ContextMenuOptionType<T> = Readonly<{
  description?: string;
  icon?: string;
  label: string;
  group?: string;
  onClick: (value?: T) => unknown;
  value?: T;
}>;

type RenderButtonProps = Readonly<{
  openMenu: (ev: React.MouseEvent) => void;
  onKeyDown: (ev: KeyboardEvent) => void;
  isMenuShowing: boolean;
  ref: React.Ref<HTMLButtonElement> | null;
  menuNode: ReactNode;
}>;

export type PropsType<T> = Readonly<{
  ariaLabel?: string;
  // contents of the button OR a function that will render the whole button
  children?: ReactNode | ((props: RenderButtonProps) => JSX.Element);
  i18n: LocalizerType;
  menuOptions: ReadonlyArray<ContextMenuOptionType<T>>;
  moduleClassName?: string;
  button?: () => JSX.Element;
  onClick?: (ev: React.MouseEvent) => unknown;
  onMenuShowingChanged?: (value: boolean) => unknown;
  popperOptions?: Pick<Options, 'placement' | 'strategy'>;
  theme?: Theme;
  title?: string;
  value?: T;
}>;

let closeCurrentOpenContextMenu: undefined | (() => unknown);

// https://popper.js.org/docs/v2/virtual-elements/
// Generating a virtual element here so that we can make the menu pop up
// right under the mouse cursor.
function generateVirtualElement(x: number, y: number): VirtualElement {
  return {
    getBoundingClientRect: () => ({
      bottom: y,
      height: 0,
      left: x,
      right: x,
      toJSON: () => ({ x, y }),
      top: y,
      width: 0,
      x,
      y,
    }),
  };
}

export function ContextMenu<T>({
  ariaLabel,
  children,
  i18n,
  menuOptions,
  moduleClassName,
  onClick,
  onMenuShowingChanged,
  popperOptions,
  theme,
  title,
  value,
}: PropsType<T>): JSX.Element {
  const [isMenuShowing, setIsMenuShowing] = useState<boolean>(false);
  const [focusedIndex, setFocusedIndex] = useState<number | undefined>(
    undefined
  );
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(
    null
  );

  const virtualElement = useRef<VirtualElement>(generateVirtualElement(0, 0));

  const [referenceElement, setReferenceElement] =
    useState<HTMLButtonElement | null>(null);

  const { styles, attributes } = usePopper(
    virtualElement.current,
    popperElement,
    {
      placement: 'top-start',
      strategy: 'fixed',
      ...popperOptions,
    }
  );

  useEffect(() => {
    if (onMenuShowingChanged) {
      onMenuShowingChanged(isMenuShowing);
    }
  }, [isMenuShowing, onMenuShowingChanged]);

  useEffect(() => {
    if (!isMenuShowing) {
      return noop;
    }

    return handleOutsideClick(
      () => {
        setIsMenuShowing(false);
        closeCurrentOpenContextMenu = undefined;
        return true;
      },
      {
        containerElements: [referenceElement, popperElement],
        name: 'ContextMenu',
      }
    );
  }, [isMenuShowing, referenceElement, popperElement]);

  const handleKeyDown = (ev: KeyboardEvent) => {
    if ((ev.key === 'Enter' || ev.key === 'Space') && !isMenuShowing) {
      closeCurrentOpenContextMenu?.();
      closeCurrentOpenContextMenu = () => setIsMenuShowing(false);
      if (referenceElement) {
        const box = referenceElement.getBoundingClientRect();
        virtualElement.current = generateVirtualElement(box.x, box.y);
      }
      setIsMenuShowing(true);
      setFocusedIndex(0);
      ev.preventDefault();
      ev.stopPropagation();
    }

    if (!isMenuShowing) {
      return;
    }

    if (ev.key === 'ArrowDown' || ev.key === 'Tab') {
      const currFocusedIndex = focusedIndex || 0;
      const nextFocusedIndex =
        currFocusedIndex >= menuOptions.length - 1 ? 0 : currFocusedIndex + 1;
      setFocusedIndex(nextFocusedIndex);
      ev.stopPropagation();
      ev.preventDefault();
    }

    if (ev.key === 'ArrowUp') {
      const currFocusedIndex = focusedIndex || 0;
      const nextFocusedIndex =
        currFocusedIndex === 0 ? menuOptions.length - 1 : currFocusedIndex - 1;
      setFocusedIndex(nextFocusedIndex);
      ev.stopPropagation();
      ev.preventDefault();
    }

    if (ev.key === 'Enter') {
      if (focusedIndex !== undefined) {
        const focusedOption = menuOptions[focusedIndex];
        focusedOption.onClick(focusedOption.value);
      }
      setIsMenuShowing(false);
      closeCurrentOpenContextMenu = undefined;
      ev.stopPropagation();
      ev.preventDefault();
    }

    if (ev.key === 'Escape') {
      setIsMenuShowing(false);
      closeCurrentOpenContextMenu = undefined;
      ev.stopPropagation();
      ev.preventDefault();
    }
  };

  const handleClick = (ev: React.MouseEvent) => {
    closeCurrentOpenContextMenu?.();
    closeCurrentOpenContextMenu = () => setIsMenuShowing(false);
    virtualElement.current = generateVirtualElement(ev.clientX, ev.clientY);
    setIsMenuShowing(true);
    ev.stopPropagation();
    ev.preventDefault();
  };

  const getClassName = getClassNamesFor('ContextMenu', moduleClassName);

  const optionElements = new Array<JSX.Element>();

  for (const [index, option] of menuOptions.entries()) {
    const previous = menuOptions[index - 1];

    const needsDivider = previous && previous.group !== option.group;

    if (needsDivider) {
      optionElements.push(
        <div
          className={getClassName('__divider')}
          key={`${option.label}-divider`}
        />
      );
    }

    // eslint-disable-next-line no-loop-func
    const onElementClick = (ev: React.MouseEvent): void => {
      ev.preventDefault();
      ev.stopPropagation();

      option.onClick(option.value);
      setIsMenuShowing(false);

      closeCurrentOpenContextMenu = undefined;
    };

    optionElements.push(
      <button
        aria-label={option.label}
        className={classNames(
          getClassName('__option'),
          focusedIndex === index ? getClassName('__option--focused') : undefined
        )}
        key={option.label}
        type="button"
        onClick={onElementClick}
      >
        <div className={getClassName('__option--container')}>
          {option.icon && (
            <div
              className={classNames(
                getClassName('__option--icon'),
                option.icon
              )}
            />
          )}
          <div>
            <div className={getClassName('__option--title')}>
              {option.label}
            </div>
            {option.description && (
              <div className={getClassName('__option--description')}>
                {option.description}
              </div>
            )}
          </div>
        </div>
        {typeof value !== 'undefined' &&
        typeof option.value !== 'undefined' &&
        value === option.value ? (
          <div className={getClassName('__option--selected')} />
        ) : null}
      </button>
    );
  }

  const menuNode = isMenuShowing ? (
    <div className={theme ? themeClassName(theme) : undefined}>
      <div
        className={classNames(
          getClassName('__popper'),
          menuOptions.length === 1
            ? getClassName('__popper--single-item')
            : undefined
        )}
        ref={setPopperElement}
        style={styles.popper}
        {...attributes.popper}
      >
        {title && <div className={getClassName('__title')}>{title}</div>}
        {optionElements}
      </div>
    </div>
  ) : undefined;

  let buttonNode: JSX.Element;

  if (typeof children === 'function') {
    buttonNode = (children as (props: RenderButtonProps) => JSX.Element)({
      openMenu: onClick || handleClick,
      onKeyDown: handleKeyDown,
      isMenuShowing,
      ref: setReferenceElement,
      menuNode,
    });
  } else {
    buttonNode = (
      <div
        className={classNames(
          getClassName('__container'),
          theme ? themeClassName(theme) : undefined
        )}
      >
        <button
          aria-label={ariaLabel || i18n('ContextMenu--button')}
          className={classNames(
            getClassName('__button'),
            isMenuShowing ? getClassName('__button--active') : undefined
          )}
          onClick={onClick || handleClick}
          onContextMenu={handleClick}
          onKeyDown={handleKeyDown}
          ref={setReferenceElement}
          type="button"
        >
          {children}
        </button>
        {menuNode}
      </div>
    );
  }
  return buttonNode;
}
