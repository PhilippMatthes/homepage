from django.contrib import admin
from django.urls import path
from django.conf.urls.static import static
from django.conf import settings

from . import views as homepage_views


urlpatterns = [
    path('admin/', admin.site.urls),

    path('', homepage_views.IndexView.as_view(), name='index'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT) \
  + static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
