import type { FC } from '../../lib/teact/teact';
import { memo, useMemo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat } from '../../api/types';
import type { ActiveDownloads, MediaViewerOrigin, MessageListType } from '../../types';
import type { IconName } from '../../types/icons';
import type { MediaViewerResumePosition } from '../../util/mediaViewerResume';
import type { MenuItemProps } from '../ui/MenuItem';
import type { MediaViewerItem, ViewableMedia } from './helpers/getViewableMedia';

import {
  getIsDownloading,
  getMediaFilename,
  getMediaFormat,
  getMediaHash,
  isChatChannel,
} from '../../global/helpers';
import {
  selectActiveDownloads,
  selectAllowedMessageActionsSlow, selectChat, selectChatMessage, selectCurrentChat,
  selectCurrentMessageList,
  selectIsChatProtected,
  selectIsMessageProtected,
  selectTabState,
} from '../../global/selectors';
import { isUserId } from '../../util/entities/ids';
import { getMediaViewerResumePosition } from '../../util/mediaViewerResume';
import selectViewableMedia from './helpers/getViewableMedia';

import useAppLayout from '../../hooks/useAppLayout';
import useFlag from '../../hooks/useFlag';
import useLastCallback from '../../hooks/useLastCallback';
import useMediaWithLoadProgress from '../../hooks/useMediaWithLoadProgress';
import useOldLang from '../../hooks/useOldLang';
import useZoomChange from './hooks/useZoomChangeSignal';

import DeleteProfilePhotoModal from '../common/DeleteProfilePhotoModal';
import Icon from '../common/icons/Icon';
import Button from '../ui/Button';
import DropdownMenu from '../ui/DropdownMenu';
import MenuItem from '../ui/MenuItem';
import ProgressSpinner from '../ui/ProgressSpinner';

import './MediaViewerActions.scss';

type OwnProps = {
  item?: MediaViewerItem;
  mediaData?: string;
  isVideo: boolean;
  canUpdateMedia?: boolean;
  canReportAvatar?: boolean;
  activeDownloads?: ActiveDownloads;
  onReportAvatar: NoneToVoidFunction;
  onBeforeDelete: NoneToVoidFunction;
  onCloseMediaViewer: NoneToVoidFunction;
  onForward: NoneToVoidFunction;
};

type StateProps = {
  activeDownloads: ActiveDownloads;
  isProtected?: boolean;
  isChatProtected?: boolean;
  canDelete?: boolean;
  chat?: ApiChat;
  canUpdate?: boolean;
  messageListType?: MessageListType;
  origin?: MediaViewerOrigin;
  viewableMedia?: ViewableMedia;
  resumePosition?: MediaViewerResumePosition;
};

const MediaViewerActions: FC<OwnProps & StateProps> = ({
  item,
  mediaData,
  isVideo,
  chat,
  isChatProtected,
  isProtected,
  canReportAvatar,
  canDelete,
  canUpdate,
  messageListType,
  activeDownloads,
  origin,
  viewableMedia,
  resumePosition,
  onReportAvatar: onReport,
  onCloseMediaViewer,
  onBeforeDelete,
  onForward,
}) => {
  const [isDeleteModalOpen, openDeleteModal, closeDeleteModal] = useFlag(false);
  const [getZoomChange, setZoomChange] = useZoomChange();
  const { isMobile } = useAppLayout();

  const {
    downloadMedia,
    cancelMediaDownload,
    updateProfilePhoto,
    updateChatPhoto,
    openMediaViewer,
    openDeleteMessageModal,
  } = getActions();

  const isMessage = item?.type === 'message';
  const canResume = Boolean(
    origin !== undefined
    && item?.type === 'message'
    && resumePosition
    && (
      resumePosition.messageId !== item.message.id
      || resumePosition.mediaIndex !== (item.mediaIndex || 0)
    ),
  );

  const { media } = viewableMedia || {};
  const fileName = media && getMediaFilename(media);
  const isDownloading = media && getIsDownloading(activeDownloads, media);

  const { loadProgress: downloadProgress } = useMediaWithLoadProgress(
    media && getMediaHash(media, 'download'),
    !isDownloading,
    media && getMediaFormat(media, 'download'),
  );

  const handleDownloadClick = useLastCallback(() => {
    if (!media) return;

    if (isDownloading) {
      cancelMediaDownload({ media });
    } else {
      const message = item?.type === 'message' ? item.message : undefined;
      downloadMedia({ media, originMessage: message });
    }
  });

  const handleZoomOut = useLastCallback(() => {
    const zoomChange = getZoomChange();
    const change = zoomChange < 0 ? zoomChange : 0;
    setZoomChange(change - 1);
  });

  const handleZoomIn = useLastCallback(() => {
    const zoomChange = getZoomChange();
    const change = zoomChange > 0 ? zoomChange : 0;
    setZoomChange(change + 1);
  });

  const handleUpdate = useLastCallback(() => {
    if (item?.type !== 'avatar') return;
    const { avatarOwner, profilePhotos, mediaIndex } = item;
    const avatarPhoto = profilePhotos?.photos[mediaIndex];
    if (isUserId(avatarOwner.id)) {
      updateProfilePhoto({ photo: avatarPhoto });
    } else {
      updateChatPhoto({ chatId: avatarOwner.id, photo: avatarPhoto });
    }

    openMediaViewer({
      origin: origin!,
      chatId: avatarOwner.id,
      mediaIndex: 0,
      isAvatarView: true,
    }, {
      forceOnHeavyAnimation: true,
    });
  });

  const handleResume = useLastCallback(() => {
    if (origin === undefined || item?.type !== 'message' || !resumePosition) return;

    openMediaViewer({
      origin,
      chatId: resumePosition.chatId,
      threadId: resumePosition.threadId ? Number(resumePosition.threadId) : undefined,
      messageId: resumePosition.messageId,
      mediaIndex: resumePosition.mediaIndex,
      withDynamicLoading: true,
    }, {
      forceOnHeavyAnimation: true,
    });
  });

  const lang = useOldLang();
  const resumeLabel = lang('ResumeMediaPosition');

  const MenuButton: FC<{ onTrigger: () => void; isOpen?: boolean }> = useMemo(() => {
    return ({ onTrigger, isOpen }) => (
      <Button
        round
        size="smaller"
        color="translucent"
        className={isOpen ? 'active' : undefined}
        onClick={onTrigger}
        ariaLabel="More actions"
        iconName="more"
      />
    );
  }, []);

  function renderDeleteModal() {
    return (item?.type === 'avatar') ? (
      <DeleteProfilePhotoModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={onBeforeDelete}
        profileId={item.avatarOwner.id}
        photo={item.profilePhotos.photos[item.mediaIndex]}
      />
    ) : undefined;
  }

  function renderDownloadButton() {
    if (isProtected || item?.type === 'standalone') {
      return undefined;
    }

    return item?.type !== 'sponsoredMessage' && (isVideo ? (
      <Button
        round
        size="smaller"
        color="translucent-white"
        ariaLabel={lang('AccActionDownload')}
        onClick={handleDownloadClick}
      >
        {isDownloading ? (
          <ProgressSpinner progress={downloadProgress} size="s" onClick={handleDownloadClick} />
        ) : (
          <Icon name="download" />
        )}
      </Button>
    ) : (
      <Button
        href={mediaData}
        download={fileName}
        round
        size="smaller"
        color="translucent-white"
        ariaLabel={lang('AccActionDownload')}
        iconName="download"
      />
    ));
  }

  const openDeleteModalHandler = useLastCallback(() => {
    if (item?.type === 'message' && chat) {
      openDeleteMessageModal({
        chatId: chat?.id,
        messageIds: [item.message.id],
        isSchedule: messageListType === 'scheduled',
        onConfirm: onBeforeDelete,
      });
    } else {
      openDeleteModal();
    }
  });

  if (isMobile) {
    const menuItems: MenuItemProps[] = [];
    if (canResume) {
      menuItems.push({
        icon: 'play',
        onClick: handleResume,
        children: resumeLabel,
      });
    }
    if (isMessage && item.message.isForwardingAllowed && !item.message.content.action && !isChatProtected) {
      menuItems.push({
        icon: 'forward',
        onClick: onForward,
        children: lang('Forward'),
      });
    }
    if (!isProtected) {
      if (isVideo) {
        menuItems.push({
          icon: isDownloading ? 'close' : 'download',
          onClick: handleDownloadClick,
          children: isDownloading ? `${Math.round(downloadProgress * 100)}% Downloading...` : 'Download',
        });
      } else {
        menuItems.push({
          icon: 'download',
          href: mediaData,
          download: fileName,
          children: lang('AccActionDownload'),
        });
      }
    }

    if (canReportAvatar) {
      menuItems.push({
        icon: 'flag',
        onClick: onReport,
        children: lang('ReportPeer.Report'),
      });
    }

    if (canUpdate) {
      menuItems.push({
        icon: 'copy-media',
        onClick: handleUpdate,
        children: lang('ProfilePhoto.SetMainPhoto'),
      });
    }

    if (canDelete) {
      menuItems.push({
        icon: 'delete',
        onClick: openDeleteModalHandler,
        children: lang('Delete'),
        destructive: true,
      });
    }

    if (menuItems.length === 0) {
      return undefined;
    }

    return (
      <div className="MediaViewerActions-mobile">
        <DropdownMenu
          trigger={MenuButton}
          positionX="right"
        >
          {menuItems.map(({
            icon, onClick, href, download, children, destructive,
          }) => (
            <MenuItem
              key={icon}
              icon={icon as IconName}
              href={href}
              download={download}
              onClick={onClick}
              destructive={destructive}
            >
              {children}
            </MenuItem>
          ))}
        </DropdownMenu>
        {isDownloading && <ProgressSpinner progress={downloadProgress} size="s" noCross />}
        {canDelete && renderDeleteModal()}
      </div>
    );
  }

  return (
    <div className="MediaViewerActions">
      {canResume && (
        <Button
          round
          size="smaller"
          color="translucent-white"
          ariaLabel={resumeLabel}
          onClick={handleResume}
          iconName="play"
        />
      )}
      {isMessage && item.message.isForwardingAllowed && !isChatProtected && (
        <Button
          round
          size="smaller"
          color="translucent-white"
          ariaLabel={lang('Forward')}
          onClick={onForward}
          iconName="forward"
        />
      )}
      {renderDownloadButton()}
      <Button
        round
        size="smaller"
        color="translucent-white"
        ariaLabel={lang('MediaZoomOut')}
        onClick={handleZoomOut}
        iconName="zoom-out"
      />
      <Button
        round
        size="smaller"
        color="translucent-white"
        ariaLabel={lang('MediaZoomIn')}
        onClick={handleZoomIn}
        iconName="zoom-in"
      />
      {canReportAvatar && (
        <Button
          round
          size="smaller"
          color="translucent-white"
          ariaLabel={lang(isVideo ? 'PeerInfo.ReportProfileVideo' : 'PeerInfo.ReportProfilePhoto')}
          onClick={onReport}
          iconName="flag"
        />
      )}
      {canUpdate && (
        <Button
          round
          size="smaller"
          color="translucent-white"
          ariaLabel={lang('ProfilePhoto.SetMainPhoto')}
          onClick={handleUpdate}
          iconName="copy-media"
        />
      )}
      {canDelete && (
        <Button
          round
          size="smaller"
          color="translucent-white"
          ariaLabel={lang('Delete')}
          onClick={openDeleteModalHandler}
          iconName="delete"
        />
      )}
      <Button
        round
        size="smaller"
        color="translucent-white"
        ariaLabel={lang('Close')}
        onClick={onCloseMediaViewer}
        iconName="close"
      />
      {canDelete && renderDeleteModal()}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, {
    item, canUpdateMedia,
  }): Complete<StateProps> => {
    const tabState = selectTabState(global);
    const { origin } = tabState.mediaViewer;

    const message = item?.type === 'message' ? item.message : undefined;
    const pageMedia = item?.type === 'pageBlock' ? item.pageMedia : undefined;
    const avatarOwner = item?.type === 'avatar' ? item.avatarOwner : undefined;
    const avatarPhoto = item?.type === 'avatar' && item.profilePhotos.photos[item.mediaIndex];

    const chat = selectCurrentChat(global);
    const currentMessageList = selectCurrentMessageList(global);
    const threadId = tabState.mediaViewer.threadId ?? currentMessageList?.threadId;
    const isProtected = pageMedia?.isProtected || selectIsMessageProtected(global, message);
    const activeDownloads = selectActiveDownloads(global);
    const isChatProtected = message && selectIsChatProtected(global, message?.chatId);
    const { canDelete: canDeleteMessage } = (threadId
      && message && selectAllowedMessageActionsSlow(global, message, threadId)) || {};
    const isCurrentAvatar = avatarPhoto && (avatarPhoto.id === avatarOwner?.avatarPhotoId);
    const canDeleteAvatar = canUpdateMedia && Boolean(avatarPhoto);
    const canDelete = canDeleteMessage || canDeleteAvatar;
    const canUpdate = canUpdateMedia && Boolean(avatarPhoto) && !isCurrentAvatar;
    const messageListType = currentMessageList?.type;
    const viewableMedia = selectViewableMedia(global, origin, item);
    const mediaChat = message ? selectChat(global, message.chatId) : undefined;
    const isChannel = Boolean(mediaChat && isChatChannel(mediaChat));

    const storedResumePosition = global.currentUserId && message && isChannel
      ? getMediaViewerResumePosition(global.currentUserId, message.chatId, threadId)
      : undefined;
    const resumeMessage = storedResumePosition
      ? selectChatMessage(global, storedResumePosition.chatId, storedResumePosition.messageId)
      : undefined;
    const resumePosition = resumeMessage ? storedResumePosition : undefined;

    return {
      activeDownloads,
      isProtected,
      chat,
      isChatProtected,
      canDelete,
      canUpdate,
      messageListType,
      origin,
      viewableMedia,
      resumePosition,
    };
  },
)(MediaViewerActions));
