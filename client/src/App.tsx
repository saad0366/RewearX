/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Route, Switch, Redirect } from 'wouter';
import MainLayout from './layouts/MainLayout';
import Home from './pages/Home';
import AboutUs from './pages/AboutUs';
import HowItWorks from './pages/HowItWorks';
import Categories from './pages/Categories';
import ContactUs from './pages/ContactUs';
import Login from './pages/Login';
import AuthSuccess from './pages/AuthSuccess';
import ForgotPassword from './pages/ForgotPassword';
import SignUp from './pages/SignUp';
import HomeFeed from './pages/HomeFeed';
import Browse from './pages/Browse';
import ItemDetail from './pages/ItemDetail';
import ListingForm from './pages/ListingForm';
import Profile from './pages/Profile';
import Swaps from './pages/Swaps';
import SwapDetail from './pages/SwapDetail';
import Disputes from './pages/Disputes';
import Chat from './pages/Chat';
import Notifications from './pages/Notifications';
import Saved from './pages/Saved';
import Recommendations from './pages/Recommendations';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <MainLayout>
          <Switch>
            {/* Public / landing */}
            <Route path="/" component={Home} />
            <Route path="/about" component={AboutUs} />
            <Route path="/how-it-works" component={HowItWorks} />
            <Route path="/categories" component={Categories} />
            <Route path="/contact" component={ContactUs} />
            <Route path="/login" component={Login} />
            <Route path="/auth/success" component={AuthSuccess} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/signup" component={SignUp} />

            {/* Authenticated client app */}
            <Route path="/home">
              {() => <Redirect to="/browse" />}
            </Route>
            <Route path="/browse" component={Browse} />
            <Route path="/items/new">
              {() => <ListingForm mode="create" />}
            </Route>
            <Route path="/items/:id/edit">
              {(params) => <ListingForm mode="edit" params={params} />}
            </Route>
            <Route path="/items/:id">
              {(params) => <ItemDetail params={params} />}
            </Route>
            <Route path="/profile" component={Profile} />
            <Route path="/users/:id">
              {(params) => <Profile params={params} isPublic />}
            </Route>
            <Route path="/swaps">
              {() => <Redirect to="/profile?tab=history" />}
            </Route>
            <Route path="/swaps/:id">
              {(params) => <SwapDetail params={params} />}
            </Route>
            <Route path="/disputes" component={Disputes} />
            <Route path="/chat">
              {() => <Chat />}
            </Route>
            <Route path="/chat/:conversationId">
              {(params) => <Chat params={params} />}
            </Route>
            <Route path="/notifications" component={Notifications} />
            <Route path="/saved" component={Saved} />
            <Route path="/recommendations" component={Recommendations} />
            <Route path="/settings" component={Settings} />

            {/* Catch-all */}
            <Route component={NotFound} />
          </Switch>
        </MainLayout>
      </ToastProvider>
    </AuthProvider>
  );
}
