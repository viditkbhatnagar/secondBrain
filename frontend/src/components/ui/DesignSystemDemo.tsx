import React, { useState } from 'react';
import {
  Button,
  IconButton,
  Input,
  SearchInput,
  Textarea,
  Card,
  CardHeader,
  CardContent,
  Modal,
  ConfirmModal,
  useToast,
  SkeletonCard,
  SkeletonList,
  NoSearchResults,
  Tooltip,
  Badge,
  StatusBadge,
  CountBadge,
  Select,
  Checkbox,
  Switch,
  Progress,
  Spinner,
  CircularProgress,
  LoadingDots,
  ThemeSelector,
  FadeIn,
  Stagger,
  StaggerItem,
  HoverScale,
  triggerConfetti,
  triggerCelebration,
  SuccessAnimation,
} from './index';
import { Heart, Star, Settings, Bell, Plus, Edit } from 'lucide-react';

export const DesignSystemDemo: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectValue, setSelectValue] = useState('');
  const [checked, setChecked] = useState(false);
  const [switched, setSwitched] = useState(false);
  const [progress] = useState(65);
  const toast = useToast();

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-12">
      <FadeIn>
        <h1 className="text-4xl font-bold gradient-text mb-2">Design System</h1>
        <p className="text-secondary-500 dark:text-secondary-400">
          A comprehensive component library for Second Brain
        </p>
      </FadeIn>

      {/* Theme */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Theme</h2>
        <ThemeSelector />
      </section>

      {/* Buttons */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-4">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="success">Success</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap gap-4">
          <Button size="xs">Extra Small</Button>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="xl">Extra Large</Button>
        </div>
        <div className="flex flex-wrap gap-4">
          <Button isLoading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button leftIcon={<Plus className="h-4 w-4" />}>With Icon</Button>
          <Button fullWidth>Full Width</Button>
        </div>
        <div className="flex gap-2">
          <IconButton icon={<Heart className="h-5 w-5" />} aria-label="Like" />
          <IconButton icon={<Star className="h-5 w-5" />} aria-label="Favorite" variant="primary" />
          <IconButton icon={<Settings className="h-5 w-5" />} aria-label="Settings" />
          <IconButton icon={<Bell className="h-5 w-5" />} aria-label="Notifications" />
        </div>
      </section>

      {/* Inputs */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Inputs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Default Input"
            placeholder="Enter text..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            helperText="This is helper text"
          />
          <Input
            label="With Error"
            placeholder="Enter email..."
            errorMessage="Please enter a valid email"
          />
          <Input
            label="With Success"
            placeholder="Username"
            successMessage="Username is available!"
          />
          <SearchInput
            placeholder="Search documents..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onClear={() => setInputValue('')}
          />
        </div>
        <Textarea
          label="Textarea"
          placeholder="Enter your message..."
          helperText="Max 500 characters"
        />
      </section>

      {/* Select */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Select</h2>
        <div className="max-w-xs">
          <Select
            label="Choose an option"
            placeholder="Select..."
            value={selectValue}
            onValueChange={setSelectValue}
            options={[
              { value: 'option1', label: 'Option 1' },
              { value: 'option2', label: 'Option 2' },
              { value: 'option3', label: 'Option 3' },
              { value: 'disabled', label: 'Disabled Option', disabled: true },
            ]}
          />
        </div>
      </section>

      {/* Checkbox & Switch */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Checkbox & Switch</h2>
        <div className="space-y-4">
          <Checkbox
            checked={checked}
            onCheckedChange={(c) => setChecked(c as boolean)}
            label="Accept terms and conditions"
            description="You agree to our Terms of Service and Privacy Policy"
          />
          <Switch
            checked={switched}
            onCheckedChange={setSwitched}
            label="Enable notifications"
            description="Receive updates about your documents"
          />
        </div>
      </section>

      {/* Cards */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card variant="elevated" hoverable>
            <CardHeader title="Elevated Card" subtitle="With hover effect" />
            <CardContent>
              <p className="text-secondary-600 dark:text-secondary-400">
                This is an elevated card with shadow.
              </p>
            </CardContent>
          </Card>
          <Card variant="outlined">
            <CardHeader title="Outlined Card" />
            <CardContent>
              <p className="text-secondary-600 dark:text-secondary-400">
                This card has a border outline.
              </p>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardHeader title="Glass Card" />
            <CardContent>
              <p className="text-secondary-600 dark:text-secondary-400">
                Glassmorphism effect with blur.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Badges */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="primary">Primary</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="primary" removable onRemove={() => {}}>Removable</Badge>
        </div>
        <div className="flex flex-wrap gap-4">
          <StatusBadge status="online" />
          <StatusBadge status="offline" />
          <StatusBadge status="busy" />
          <StatusBadge status="pending" />
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Bell className="h-6 w-6 text-secondary-500" />
            <CountBadge count={5} className="absolute -top-2 -right-2" />
          </div>
          <div className="relative">
            <Bell className="h-6 w-6 text-secondary-500" />
            <CountBadge count={150} className="absolute -top-2 -right-2" />
          </div>
        </div>
      </section>

      {/* Progress */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Progress</h2>
        <div className="space-y-4">
          <Progress value={progress} showLabel label="Upload Progress" />
          <Progress value={80} variant="success" size="lg" />
          <Progress value={45} variant="warning" size="sm" />
        </div>
        <div className="flex items-center gap-8">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
          <CircularProgress value={75} />
          <LoadingDots />
        </div>
      </section>

      {/* Skeletons */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Skeletons</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonList items={3} />
        </div>
      </section>

      {/* Empty States */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Empty States</h2>
        <Card>
          <NoSearchResults query="example search" onClear={() => {}} />
        </Card>
      </section>

      {/* Tooltips */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Tooltips</h2>
        <div className="flex gap-4">
          <Tooltip content="This is a tooltip">
            <Button variant="secondary">Hover me</Button>
          </Tooltip>
          <Tooltip content="Edit this item" side="right">
            <IconButton icon={<Edit className="h-5 w-5" />} aria-label="Edit" />
          </Tooltip>
        </div>
      </section>

      {/* Modals */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Modals</h2>
        <div className="flex gap-4">
          <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Delete Item
          </Button>
        </div>
        <Modal
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Example Modal"
          description="This is a modal dialog with smooth animations."
        >
          <p className="text-secondary-600 dark:text-secondary-400">
            Modal content goes here. You can put any content inside.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModalOpen(false)}>Confirm</Button>
          </div>
        </Modal>
        <ConfirmModal
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete Item?"
          description="This action cannot be undone. Are you sure you want to delete this item?"
          confirmText="Delete"
          onConfirm={() => {
            setConfirmOpen(false);
            toast.success('Item deleted', 'The item has been removed.');
          }}
        />
      </section>

      {/* Toasts */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Toasts</h2>
        <div className="flex flex-wrap gap-4">
          <Button onClick={() => toast.success('Success!', 'Your action was completed.')}>
            Success Toast
          </Button>
          <Button
            variant="danger"
            onClick={() => toast.error('Error!', 'Something went wrong.')}
          >
            Error Toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.warning('Warning!', 'Please review your input.')}
          >
            Warning Toast
          </Button>
          <Button
            variant="ghost"
            onClick={() => toast.info('Info', 'Here is some information.')}
          >
            Info Toast
          </Button>
        </div>
      </section>

      {/* Animations */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Animations</h2>
        <div className="flex flex-wrap gap-4">
          <Button onClick={() => triggerConfetti()}>🎉 Confetti</Button>
          <Button onClick={() => triggerCelebration()}>🎊 Celebration</Button>
        </div>
        <div className="flex items-center gap-8">
          <SuccessAnimation size={48} />
          <HoverScale>
            <Card padding="md" hoverable>
              <p>Hover to scale</p>
            </Card>
          </HoverScale>
        </div>
        <Stagger className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <StaggerItem key={i}>
              <Card padding="md">
                <p className="text-center">Item {i}</p>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </div>
  );
};

export default DesignSystemDemo;
