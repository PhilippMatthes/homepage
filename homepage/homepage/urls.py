from django.contrib import admin
from django.urls import path
from django.conf.urls.static import static
from django.conf import settings
from django.views.decorators.cache import cache_control
from django.contrib.staticfiles.views import serve

from . import views as homepage_views


urlpatterns = [
    path('admin/', admin.site.urls),

    path('', homepage_views.IndexView.as_view(), name='index'),
]

if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        view=cache_control(max_age=settings.CACHE_CONTROL_MAX_AGE)(serve),
        document_root=settings.MEDIA_ROOT
    )
    urlpatterns += static(
        settings.STATIC_URL,
        view=cache_control(max_age=settings.CACHE_CONTROL_MAX_AGE)(serve),
        document_root=settings.STATIC_ROOT
    )
