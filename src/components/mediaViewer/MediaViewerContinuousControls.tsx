import { memo, useMemo } from '../../lib/teact/teact';

import type { ContinuousMediaFilter } from '../../types';
import type { LangFn } from '../../util/localization';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Icon from '../common/icons/Icon';
import Button from '../ui/Button';
import DropdownMenu from '../ui/DropdownMenu';
import MenuItem from '../ui/MenuItem';

import styles from './MediaViewerContinuousControls.module.scss';

type OwnProps = {
  isActive?: boolean;
  isPaused?: boolean;
  filter: ContinuousMediaFilter;
  shouldAutoSave: boolean;
  position?: number;
  total?: number;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onToggle: NoneToVoidFunction;
  onTogglePause: NoneToVoidFunction;
  onPrevious: NoneToVoidFunction;
  onNext: NoneToVoidFunction;
  onFilterChange: (filter: ContinuousMediaFilter) => void;
  onToggleAutoSave: NoneToVoidFunction;
};

type FilterButtonProps = {
  onTrigger: () => void;
  isOpen?: boolean;
};

const MediaViewerContinuousControls = ({
  isActive,
  isPaused,
  filter,
  shouldAutoSave,
  position,
  total,
  hasPrevious,
  hasNext,
  onToggle,
  onTogglePause,
  onPrevious,
  onNext,
  onFilterChange,
  onToggleAutoSave,
}: OwnProps) => {
  const lang = useLang();

  const handleAllMediaFilter = useLastCallback(() => onFilterChange('all'));
  const handlePhotoFilter = useLastCallback(() => onFilterChange('photos'));
  const handleVideoFilter = useLastCallback(() => onFilterChange('videos'));

  const filterLabel = getFilterLabel(lang, filter);
  const FilterButton = useMemo(() => {
    return ({ onTrigger, isOpen }: FilterButtonProps) => (
      <Button
        className={buildClassName(styles.filterButton, isOpen && styles.isActive)}
        color="translucent-white"
        size="smaller"
        onClick={onTrigger}
        ariaLabel={lang('ContinuousMediaFilter')}
      >
        <span className={styles.filterLabel}>{filterLabel}</span>
        <Icon name="down" />
      </Button>
    );
  }, [filterLabel, lang]);

  return (
    <div className={styles.root}>
      <Button
        round
        size="smaller"
        color={isActive ? 'primary' : 'translucent-white'}
        iconName="play"
        ariaLabel={lang('ContinuousMediaBrowse')}
        onClick={onToggle}
      />
      {isActive && (
        <>
          <Button
            round
            size="smaller"
            color="translucent-white"
            iconName={isPaused ? 'play' : 'pause'}
            ariaLabel={lang(isPaused ? 'ContinuousMediaResume' : 'ContinuousMediaPause')}
            onClick={onTogglePause}
          />
          <Button
            round
            size="smaller"
            color="translucent-white"
            iconName="skip-previous"
            ariaLabel={lang('AccDescrPrevious')}
            disabled={!hasPrevious}
            onClick={onPrevious}
          />
          <Button
            round
            size="smaller"
            color="translucent-white"
            iconName="skip-next"
            ariaLabel={lang('Next')}
            disabled={!hasNext}
            onClick={onNext}
          />
          {position !== undefined && total !== undefined && (
            <span className={styles.position}>{lang('ContinuousMediaPosition', { position, total })}</span>
          )}
          <DropdownMenu
            className={styles.filterMenu}
            trigger={FilterButton}
            positionY="bottom"
          >
            <MenuItem onClick={handleAllMediaFilter}>{lang('ContinuousMediaFilterAll')}</MenuItem>
            <MenuItem onClick={handlePhotoFilter}>{lang('ContinuousMediaFilterPhotos')}</MenuItem>
            <MenuItem onClick={handleVideoFilter}>{lang('ContinuousMediaFilterVideos')}</MenuItem>
          </DropdownMenu>
          <Button
            round
            size="smaller"
            color={shouldAutoSave ? 'primary' : 'translucent-white'}
            iconName="download"
            ariaLabel={lang('ContinuousMediaAutoSave')}
            onClick={onToggleAutoSave}
          />
        </>
      )}
    </div>
  );
};

export default memo(MediaViewerContinuousControls);

function getFilterLabel(lang: LangFn, filter: ContinuousMediaFilter) {
  switch (filter) {
    case 'photos':
      return lang('ContinuousMediaFilterPhotos');
    case 'videos':
      return lang('ContinuousMediaFilterVideos');
    default:
      return lang('ContinuousMediaFilterAll');
  }
}
