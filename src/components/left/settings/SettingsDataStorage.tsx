import { memo, useState } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { AccountSettings, ContinuousMediaSettings } from '../../../types';

import { AUTODOWNLOAD_FILESIZE_MB_LIMITS } from '../../../config';
import { purgeClearableCache } from '../../../util/cacheApi';
import {
  clearAccountMediaViewHistory, getShouldOnlyShowUnviewedMedia, setShouldOnlyShowUnviewedMedia,
} from '../../../util/channelMediaViewHistory';
import { pick } from '../../../util/iteratees';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandTitle } from '../../gili/layout/Island';
import Checkbox from '../../ui/Checkbox';
import ListItem from '../../ui/ListItem';
import RangeSlider from '../../ui/RangeSlider';

type OwnProps = {
  isActive?: boolean;
  onReset: NoneToVoidFunction;
};

type StateProps = Pick<AccountSettings, (
  'canAutoLoadPhotoFromContacts' |
  'canAutoLoadPhotoInPrivateChats' |
  'canAutoLoadPhotoInGroups' |
  'canAutoLoadPhotoInChannels' |
  'canAutoLoadVideoFromContacts' |
  'canAutoLoadVideoInPrivateChats' |
  'canAutoLoadVideoInGroups' |
  'canAutoLoadVideoInChannels' |
  'canAutoLoadFileFromContacts' |
  'canAutoLoadFileInPrivateChats' |
  'canAutoLoadFileInGroups' |
  'canAutoLoadFileInChannels' |
  'autoLoadFileMaxSizeMb'
)> & {
  continuousMediaSettings: ContinuousMediaSettings;
  currentUserId?: string;
};

const CONTINUOUS_MEDIA_PHOTO_DURATIONS = [2, 3, 5, 8, 10, 15, 30];
const CONTINUOUS_MEDIA_AUTO_SAVE_FILESIZE_MB_LIMITS = [50, 100, 200, 500];

const SettingsDataStorage = ({
  isActive,
  canAutoLoadPhotoFromContacts,
  canAutoLoadPhotoInPrivateChats,
  canAutoLoadPhotoInGroups,
  canAutoLoadPhotoInChannels,
  canAutoLoadVideoFromContacts,
  canAutoLoadVideoInPrivateChats,
  canAutoLoadVideoInGroups,
  canAutoLoadVideoInChannels,
  canAutoLoadFileFromContacts,
  canAutoLoadFileInPrivateChats,
  canAutoLoadFileInGroups,
  canAutoLoadFileInChannels,
  autoLoadFileMaxSizeMb,
  continuousMediaSettings,
  currentUserId,
  onReset,
}: OwnProps & StateProps) => {
  const { setSettingOption, showNotification, updateMediaViewerContinuousSettings } = getActions();

  const lang = useLang();
  const [shouldOnlyShowUnviewed, setShouldOnlyShowUnviewed] = useState(
    () => getShouldOnlyShowUnviewedMedia(),
  );

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  const renderFileSizeCallback = useLastCallback((value: number) => {
    const size = AUTODOWNLOAD_FILESIZE_MB_LIMITS[value];
    return lang('AutodownloadSizeLimitUpTo', {
      limit: lang('MediaSizeMB', { size }, { pluralValue: size }),
    });
  });

  const handleFileSizeChange = useLastCallback((value: number) => {
    setSettingOption({ autoLoadFileMaxSizeMb: AUTODOWNLOAD_FILESIZE_MB_LIMITS[value] });
  });

  const handlePurge = useLastCallback(() => {
    purgeClearableCache();
    showNotification({
      message: { key: 'SettingsDataClearMediaDone' },
    });
  });

  const renderContinuousMediaPhotoDuration = useLastCallback((value: number) => {
    const duration = CONTINUOUS_MEDIA_PHOTO_DURATIONS[value];
    return lang('Seconds', { count: duration }, { pluralValue: duration });
  });

  const handleContinuousMediaPhotoDurationChange = useLastCallback((value: number) => {
    updateMediaViewerContinuousSettings({ photoDuration: CONTINUOUS_MEDIA_PHOTO_DURATIONS[value] });
  });

  const renderContinuousMediaAutoSaveSize = useLastCallback((value: number) => {
    const size = CONTINUOUS_MEDIA_AUTO_SAVE_FILESIZE_MB_LIMITS[value];
    return lang('MediaSizeMB', { size }, { pluralValue: size });
  });

  const handleContinuousMediaAutoSaveSizeChange = useLastCallback((value: number) => {
    updateMediaViewerContinuousSettings({
      autoSaveMaxSizeMb: CONTINUOUS_MEDIA_AUTO_SAVE_FILESIZE_MB_LIMITS[value],
    });
  });

  const handleOnlyShowUnviewedChange = useLastCallback((value: boolean) => {
    if (setShouldOnlyShowUnviewedMedia(value)) {
      setShouldOnlyShowUnviewed(value);
    }
  });

  const handleClearMediaViewHistory = useLastCallback(() => {
    if (!currentUserId || !clearAccountMediaViewHistory(currentUserId)) return;

    showNotification({
      message: { key: 'ContinuousMediaViewHistoryCleared' },
    });
  });

  function renderContentSizeSlider() {
    const value = AUTODOWNLOAD_FILESIZE_MB_LIMITS.indexOf(autoLoadFileMaxSizeMb);

    return (
      <div>
        <RangeSlider
          label={lang('AutoDownloadMaxFileSize')}
          min={0}
          max={5}
          value={value !== -1 ? value : 2}
          renderValue={renderFileSizeCallback}
          onChange={handleFileSizeChange}
        />
      </div>
    );
  }

  function renderAutoDownloadBlock(
    title: string,
    key: 'Photo' | 'Video' | 'File',
    canAutoLoadFromContacts: boolean,
    canAutoLoadInPrivateChats: boolean,
    canAutoLoadInGroups: boolean,
    canAutoLoadInChannels: boolean,
  ) {
    return (
      <>
        <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{title}</IslandTitle>
        <Island>
          <Checkbox
            label={lang('AutoDownloadSettingsContacts')}
            checked={canAutoLoadFromContacts}
            // TODO rewrite to support `useCallback`
            onCheck={(isChecked) => setSettingOption({ [`canAutoLoad${key}FromContacts`]: isChecked })}
          />
          <Checkbox
            label={lang('AutoDownloadSettingsPrivateChats')}
            checked={canAutoLoadInPrivateChats}
            onCheck={(isChecked) => setSettingOption({ [`canAutoLoad${key}InPrivateChats`]: isChecked })}
          />
          <Checkbox
            label={lang('AutoDownloadSettingsGroupChats')}
            checked={canAutoLoadInGroups}
            onCheck={(isChecked) => setSettingOption({ [`canAutoLoad${key}InGroups`]: isChecked })}
          />
          <Checkbox
            label={lang('AutoDownloadSettingsChannels')}
            checked={canAutoLoadInChannels}
            onCheck={(isChecked) => setSettingOption({ [`canAutoLoad${key}InChannels`]: isChecked })}
          />
          {key === 'File' && renderContentSizeSlider()}
        </Island>
      </>
    );
  }

  function renderContinuousMediaBlock() {
    const photoDurationIndex = CONTINUOUS_MEDIA_PHOTO_DURATIONS.indexOf(continuousMediaSettings.photoDuration);
    const autoSaveSizeIndex = CONTINUOUS_MEDIA_AUTO_SAVE_FILESIZE_MB_LIMITS
      .indexOf(continuousMediaSettings.autoSaveMaxSizeMb);

    return (
      <>
        <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('ContinuousMediaSettings')}</IslandTitle>
        <Island>
          <Checkbox
            label={lang('ContinuousMediaDefault')}
            checked={continuousMediaSettings.isDefaultEnabled}
            onCheck={(isDefaultEnabled) => updateMediaViewerContinuousSettings({ isDefaultEnabled })}
          />
          <Checkbox
            label={lang('ContinuousMediaUnviewedOnly')}
            checked={shouldOnlyShowUnviewed}
            onCheck={handleOnlyShowUnviewedChange}
          />
          <RangeSlider
            label={lang('ContinuousMediaPhotoDuration')}
            min={0}
            max={CONTINUOUS_MEDIA_PHOTO_DURATIONS.length - 1}
            value={photoDurationIndex !== -1 ? photoDurationIndex : 2}
            renderValue={renderContinuousMediaPhotoDuration}
            onChange={handleContinuousMediaPhotoDurationChange}
          />
          <Checkbox
            label={lang('ContinuousMediaAutoSave')}
            checked={continuousMediaSettings.shouldAutoSave}
            onCheck={(shouldAutoSave) => updateMediaViewerContinuousSettings({ shouldAutoSave })}
          />
          {continuousMediaSettings.shouldAutoSave && (
            <>
              <Checkbox
                label={lang('ContinuousMediaAutoSavePhotos')}
                checked={continuousMediaSettings.shouldAutoSavePhotos}
                onCheck={(shouldAutoSavePhotos) => updateMediaViewerContinuousSettings({ shouldAutoSavePhotos })}
              />
              <Checkbox
                label={lang('ContinuousMediaAutoSaveVideos')}
                checked={continuousMediaSettings.shouldAutoSaveVideos}
                onCheck={(shouldAutoSaveVideos) => updateMediaViewerContinuousSettings({ shouldAutoSaveVideos })}
              />
              <RangeSlider
                label={lang('ContinuousMediaAutoSaveMaxSize')}
                min={0}
                max={CONTINUOUS_MEDIA_AUTO_SAVE_FILESIZE_MB_LIMITS.length - 1}
                value={autoSaveSizeIndex !== -1 ? autoSaveSizeIndex : 2}
                renderValue={renderContinuousMediaAutoSaveSize}
                onChange={handleContinuousMediaAutoSaveSizeChange}
              />
            </>
          )}
          <ListItem
            icon="delete"
            multiline
            onClick={handleClearMediaViewHistory}
          >
            <span className="title">{lang('ContinuousMediaClearViewHistory')}</span>
            <span className="subtitle">{lang('ContinuousMediaClearViewHistoryDescription')}</span>
          </ListItem>
        </Island>
      </>
    );
  }

  return (
    <div className="settings-content custom-scroll">
      {renderAutoDownloadBlock(
        lang('AutoDownloadPhotosTitle'),
        'Photo',
        canAutoLoadPhotoFromContacts,
        canAutoLoadPhotoInPrivateChats,
        canAutoLoadPhotoInGroups,
        canAutoLoadPhotoInChannels,
      )}
      {renderAutoDownloadBlock(
        lang('AutoDownloadVideosTitle'),
        'Video',
        canAutoLoadVideoFromContacts,
        canAutoLoadVideoInPrivateChats,
        canAutoLoadVideoInGroups,
        canAutoLoadVideoInChannels,
      )}
      {renderAutoDownloadBlock(
        lang('AutoDownloadFilesTitle'),
        'File',
        canAutoLoadFileFromContacts,
        canAutoLoadFileInPrivateChats,
        canAutoLoadFileInGroups,
        canAutoLoadFileInChannels,
      )}
      {renderContinuousMediaBlock()}
      <Island>
        <ListItem
          onClick={handlePurge}
          icon="delete"
          multiline
        >
          <span className="title">
            {lang('SettingsDataClearMediaCache')}
          </span>
          <span className="subtitle">
            {lang('SettingsDataClearMediaCacheDescription')}
          </span>
        </ListItem>
      </Island>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => {
    return {
      ...pick(global.settings.byKey, [
        'canAutoLoadPhotoFromContacts',
        'canAutoLoadPhotoInPrivateChats',
        'canAutoLoadPhotoInGroups',
        'canAutoLoadPhotoInChannels',
        'canAutoLoadVideoFromContacts',
        'canAutoLoadVideoInPrivateChats',
        'canAutoLoadVideoInGroups',
        'canAutoLoadVideoInChannels',
        'canAutoLoadFileFromContacts',
        'canAutoLoadFileInPrivateChats',
        'canAutoLoadFileInGroups',
        'canAutoLoadFileInChannels',
        'autoLoadFileMaxSizeMb',
      ]),
      continuousMediaSettings: global.mediaViewer.continuousMedia,
      currentUserId: global.currentUserId,
    };
  },
)(SettingsDataStorage));
